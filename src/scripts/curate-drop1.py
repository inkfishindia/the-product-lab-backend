#!/usr/bin/env python3
"""
Drop 1 curation classifier (D-028).
Input : artifacts/phase-4/catalog-curation/catalog-export-raw.tsv
Output: drop1-plan.json  (publish list w/ clean titles + collection, draft buckets)
        drop1-apply.sql   (executable: draft-all, then publish+rename+collect winners)

Rules (D-020 / D-028):
  - Licensed IP            -> draft (excluded from launch, flag licensing review)
  - Pure object/illustration -> draft backlog
  - Text-opinion design    -> Drop 1, deduped to ONE canonical SKU per opinion,
                              assigned to exactly one collection (single FK).
"""
import csv, json, re, os, html

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
CUR  = os.path.join(ROOT, "artifacts", "phase-4", "catalog-curation")
SRC  = os.path.join(CUR, "catalog-export-raw.tsv")

# ---------- keyword sets ----------
LICENSED = [
 r"star ?wars", "r2d2", "millennium", "stormtrooper", "yoda", "mandalorian",
 "darth", "jedi", "sith", "batman", "superman", "joker", "marvel", "deadpool",
 "spider", "avenger", "iron ?man", "thor", "hulk", "captain america",
 "harry potter", "hogwarts", "deathly", "hedwig", "mischief", "bts", "blackpink",
 "exo", "k-?pop", "nike", "jordan", "air ?max", "air ?force", r"\bairs\b",
 "adidas", "puma", "reebok", "travis scott", "coca", "pepsi", "fanta", "sprite",
 "disney", "mickey", "minnie", "simpson", "homer", "duff", r"\brick\b", "morty",
 "chelsea", "arsenal", "bayern", "barcelon", "psg", "juventus", "liverpool",
 "man ?city", "manchester", "real madrid", "messi", "ronaldo", "neymar",
 "pokemon", "pikachu", "gengar", "naruto", "akatsuki", "anime", "goku",
 "dragon ball", r"\bf1\b", "ferrari", "mercedes", "lamborghini", "porsche",
 "gucci", "supreme", "louis", "cartoon network", "tom and jerry", "mario",
 "luigi", "sonic", "netflix", "friends", "himym", "breaking bad", "game of thrones",
 r"\bgot\b", "stranger things", "squid game", "peaky", "sherlock", "powerpuff",
 "ben ?10", "doraemon", "minion", "shinchan", "garfield", "snoopy", "hello kitty",
 "winnie", "grogu", "monopoly", "playstation", "pubg", "dota", "xbox",
 "got 'em", "got em", "g-amp;-s", "g-s-162",  # "GOT 'Em Sneakers" = Nike
 # --- second-pass leaks ---
 "rolling stones", "donald", "pokeball", "poke ball", "gameboy", "game boy",
 "polaroid", "snkrs", "af1", "air force", "nine ?nine", "brooklyn", "broklyn",
 "sex tape", "adobe", "photoshop", "illustrator", "after effects", "premiere pro",
 "lightroom", "indesign", "spotify", "nintendo",
]
# Medusa starter-seed demo apparel -> DELETE (D-011 violation, not real TPL product)
DELETE = [r"medusa (t-?shirt|sweat ?shirt|sweat ?pants|shorts|sweat)", "medusa t-shirt"]

# pure objects / illustrations with NO opinion (held as draft backlog)
OBJECT = [
 "sushi", "burger", "pizza", "coffee", "cocoa", r"\bgin\b", "wine", r"\bbeer\b",
 "cola", "peach", "strawberr", "cherry", "avocado", "banana", "donut", "doughnut",
 "cupcake", "ice ?cream", "fries", "noodle", "ramen", "taco", "croissant",
 "macaron", "macaroon", "mushroom", "cactus", "unicorn", "rainbow", "pancake",
 "moka", "fox", "panda", "penguin", "flower", "rose", "daisy", "cherry blossom",
 "mixtape", "vinyl", "cassette", "guitar", "rainbow cake",
 # --- second-pass leaks ---
 "bunny", r"\bpaw\b", "dog paw", "cute cat", "manta", "scuba", "diving",
 r"\btravel\b", "backpack", "bagpack", r"\bdogs\b", "sushi love",
]

# opinion phrases that OVERRIDE object/licensed-ish matches (these are statements/puns)
OPINION_OVERRIDE = [
 "coffee made my day", "beer pressure", "give into beer", "first we eat",
 "all we need is love", "love bites", "vitamin sea",
 "vacation in a bottle", "world in a bottle", "less panic more disco",
 "serotonin", "selflove", "self love", "boy tears", "crazy cat", "sleepy cat",
 "cat lady", "dog approved", "dogs go woof", "woof woof", "easily distracted",
 "cat yin", "cat fish bowl", "boss babe", "explore more", "travel backpack",
 "camping lighter", "fierce lighter", "world on fire", "everything sucks",
 "everthing sucks", "watch me whip", "hot stuff", "heart breaker", "take me out",
 "insta like", "professional binge", "warning feeling", "bibliophile",
 "chill pill", "girl power", "munchies", "stress meowt", "hot mess",
 "smokers access",
]

# ---------- collection assignment (mutually exclusive themes) ----------
# each entry: (collection, [keywords]); first match wins; fallback = "Big Mood"
COLLECTIONS = [
 ("Certified Disaster", [   # burnout / nihilist / chaos / self-deprecating
   "always tired", "forever alone", "monday morning", "shit happens",
   "crystal bullshit", "bullshit remover", "enjoy the shit", "shitshow",
   "straight outta", "f#", "world on fire", "everything sucks", "everthing sucks",
   "boy tears", "idiot repel", "professional binge", "warning feeling",
   "hot mess", "always hungry", "camping lighter", "fierce lighter",
 ]),
 ("Main Character Energy", [ # confidence / flex / attitude
   "boss babe", "rich af", "suck it", "hot stuff", "noice", "watch me whip",
   "shut up", "insta like", "take my money", "bibliophile", "kiss my airs",
   "sneaker collection",
 ]),
 ("Soft Serve", [           # love / wellness / wholesome / wander
   "all we need is love", "less panic more disco", "serotonin", "selflove",
   "self love", "love bites", "heart breaker", "take me out", "first we eat",
   "vacation in a bottle", "world in a bottle", "explore more", "travel backpack",
   "vitamin sea", "coffee made my day", "beer pressure", "moka pot",
 ]),
 ("Cat & Dog People", [     # pet-person identity (gifting gold)
   "crazy cat", "sleepy cat", "cat club", "cat yin", "cat fish bowl",
   "dog approved", "dogs go woof", "woof woof", "easily distracted by dogs",
 ]),
]
FALLBACK_COLLECTION = "Big Mood"   # any opinion not matched above

# ---------- title cleaning ----------
CAT_SUFFIX = re.compile(
  r"\s*[-–]?\s*(fridge magnets?|magnet|keychains?|keychian|earrings?|"
  r"lapel pins?|card stickers?|pop ?up 3d stickers?|pop ?up stickers?|stickers?|luggage tags?)\s*$",
  re.I)
TYPOS = {"everthing": "Everything", "repelent": "Repellent", "selflove": "Self Love",
         "keychian": "", "offwhite": "Off-White"}

KEEP_CAPS = {"AF","TV","DIY","OK","XOXO","BFF","WASD","FYI","WTF","IDK"}
def sentence_case(s):
    """On-brand group-chat register: sentence case, preserve deliberate acronyms."""
    words = s.split()
    out=[]
    for i,w in enumerate(words):
        up=w.upper()
        if up in KEEP_CAPS:
            out.append(up); continue
        if any(c.isdigit() for c in w) or "#" in w:   # F#cks, AF1 handled above
            out.append(w); continue
        lw=w.lower()
        if i==0:
            out.append(lw[:1].upper()+lw[1:])
        else:
            out.append(lw)
    return " ".join(out)

def clean_title(t):
    t = html.unescape(t).strip()
    t = CAT_SUFFIX.sub("", t).strip(" -–")
    for k,v in TYPOS.items():
        t = re.sub(k, v, t, flags=re.I) if v else re.sub(r"\s*"+k+r"\s*"," ",t,flags=re.I)
    t = re.sub(r"\s+"," ",t).strip()
    # on-brand sentence case; preserve deliberate acronyms
    t = sentence_case(t)
    t = t.replace("F#_ks","F#cks").replace("F#_Ks","F#cks")
    return t

def match_any(text, pats):
    return any(re.search(p, text, re.I) for p in pats)

def design_key(clean):
    """normalize for dedup across product types: lowercase, strip non-alnum"""
    return re.sub(r"[^a-z0-9]","", clean.lower())

# ---------- run ----------
rows=[]
with open(SRC, newline="") as f:
    r=csv.reader(f, delimiter="\t")
    header=next(r)
    for row in r:
        if len(row)<6: continue
        rows.append(dict(id=row[0],handle=row[1],title=row[2],
                         category=row[3],descr=row[4]))

publish=[]; draft_lic=[]; draft_obj=[]; draft_dupe=[]; delete=[]
seen={}  # design_key -> winner id

for p in rows:
    t=p["title"]
    low=html.unescape(t).lower()
    if match_any(low, DELETE):
        delete.append(p); continue
    override = match_any(low, OPINION_OVERRIDE)
    if match_any(low, LICENSED) and not override:
        draft_lic.append(p); continue
    if match_any(low, OBJECT) and not override:
        draft_obj.append(p); continue
    # ---- opinion -> Drop 1 candidate ----
    clean=clean_title(t)
    key=design_key(clean)
    if not key:  # empty after cleaning (e.g. "No earrings" -> "No"? keep)
        key=design_key(t)
    if key in seen:
        draft_dupe.append({**p,"dup_of":seen[key],"clean":clean}); continue
    # assign collection
    coll=FALLBACK_COLLECTION
    for cname,kws in COLLECTIONS:
        if match_any(low,kws): coll=cname; break
    seen[key]=p["id"]
    publish.append({**p,"clean":clean,"collection":coll})

# prefer a winner WITH description if a later dup has one (swap)
by_key={}
for w in publish: by_key.setdefault(design_key(w["clean"]),w)

plan=dict(
  publish=publish, draft_licensed=draft_lic, draft_object=draft_obj,
  draft_dupe=draft_dupe, delete=delete,
  counts=dict(total=len(rows),publish=len(publish),
              licensed=len(draft_lic),object=len(draft_obj),
              dupe=len(draft_dupe),delete=len(delete)),
)
# per-collection counts
coll_counts={}
for w in publish: coll_counts[w["collection"]]=coll_counts.get(w["collection"],0)+1
plan["collection_counts"]=coll_counts

with open(os.path.join(CUR,"drop1-plan.json"),"w") as f:
    json.dump(plan,f,indent=1)

print("=== COUNTS ===")
print(json.dumps(plan["counts"],indent=1))
print("=== PER COLLECTION ===")
print(json.dumps(coll_counts,indent=1))
print("=== SAMPLE PUBLISH (clean titles) ===")
for w in publish[:25]:
    print(f"  [{w['collection']:22}] {w['title']!r:45} -> {w['clean']!r}")
print("...")
print(f"FALLBACK 'Big Mood' members ({coll_counts.get('Big Mood',0)}):")
for w in publish:
    if w["collection"]=="Big Mood": print("   ", w["clean"])
