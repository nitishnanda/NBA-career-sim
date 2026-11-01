#!/usr/bin/env python3
"""Build src/hsdata.js: real US high schools by state (and the national boarding prep powerhouses), each with its most famous NBA alumni.

The schools are a hand-picked list of well-known basketball high schools; every alumnus comes from that school's own Wikipedia article
(the notable-alumni lines that mention the NBA or basketball), ranked by fame (all-time greats, Hall of Fame / MVP / All-Star / champion in
the line, current NBA players). Schools whose article cannot be found or names no NBA alumni are dropped. Cached in /tmp/eurocache.
"""
import json, os, re, sys, hashlib, urllib.parse, urllib.request

CACHE = '/tmp/eurocache'; os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'NBACareerSimBuild/1.0 (personal hobby project; contact via github nitishnanda)'}
ROOT = os.path.join(os.path.dirname(__file__), '..')

def raw(title):
    f = os.path.join(CACHE, hashlib.md5(title.encode()).hexdigest() + '.txt')
    if os.path.exists(f): return open(f, encoding='utf8').read()
    url = 'https://en.wikipedia.org/w/index.php?title=' + urllib.parse.quote(title.replace(' ', '_')) + '&action=raw'
    try: t = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf8')
    except Exception: t = ''
    if t.lstrip().startswith('<!DOCTYPE'): t = ''
    m = re.match(r'\s*#REDIRECT\s*\[\[([^\]|#]+)', t, re.I)
    if m: t = raw(m.group(1))
    open(f, 'w', encoding='utf8').write(t); return t

# (title, city, type) -- type: national (boarding prep powerhouse), power (in-state powerhouse), local (a strong public / city school)
S = {
 'AL': [('Leeds High School (Alabama)', 'Leeds', 'local'), ('Lee High School (Huntsville, Alabama)', 'Huntsville', 'local'), ('Hoover High School (Alabama)', 'Hoover', 'power'), ('Parker High School (Birmingham, Alabama)', 'Birmingham', 'local'), ('Mountain Brook High School', 'Mountain Brook', 'power'), ('Huffman High School', 'Birmingham', 'local'), ('Butler High School (Huntsville, Alabama)', 'Huntsville', 'local')],
 'AK': [('Bartlett High School (Alaska)', 'Anchorage', 'local'), ('East Anchorage High School', 'Anchorage', 'local'), ('Service High School', 'Anchorage', 'local'), ('Dimond High School', 'Anchorage', 'local')],
 'AZ': [('Brophy College Preparatory', 'Phoenix', 'power'), ('Corona del Sol High School', 'Tempe', 'local'), ('Desert Vista High School', 'Phoenix', 'local'), ('Shadow Mountain High School', 'Phoenix', 'local'), ('Mountain Pointe High School', 'Phoenix', 'local'), ('Sunnyslope High School', 'Phoenix', 'local')],
 'AR': [('Little Rock Central High School', 'Little Rock', 'power'), ('North Little Rock High School', 'North Little Rock', 'power'), ('Parkview Arts and Science Magnet High School', 'Little Rock', 'local'), ('Pine Bluff High School', 'Pine Bluff', 'local'), ('Bentonville High School', 'Bentonville', 'local'), ('Hall High School (Arkansas)', 'Little Rock', 'local'), ('Fayetteville High School (Arkansas)', 'Fayetteville', 'local')],
 'CA': [('Mater Dei High School (Santa Ana, California)', 'Santa Ana', 'power'), ('Sierra Canyon School', 'Chatsworth', 'power'), ('Harvard-Westlake School', 'Los Angeles', 'power'), ('Long Beach Polytechnic High School', 'Long Beach', 'power'), ('Crenshaw High School', 'Los Angeles', 'local'), ('St. Joseph Notre Dame High School', 'Alameda', 'local'), ('Leuzinger High School', 'Lawndale', 'local'), ('McClymonds High School', 'Oakland', 'local'), ('Westchester High School (Los Angeles)', 'Los Angeles', 'local'), ('Fairfax High School (Los Angeles)', 'Los Angeles', 'local'), ('Oakland High School (Oakland, California)', 'Oakland', 'local'), ('Lower Merion High School', 'x', 'skip')],
 'CO': [('George Washington High School (Denver)', 'Denver', 'local'), ('Overland High School', 'Aurora', 'local'), ('Regis Jesuit High School', 'Aurora', 'power'), ('Eaglecrest High School', 'Centennial', 'local'), ('Mullen High School', 'Denver', 'local'), ('Denver East High School', 'Denver', 'local')],
 'CT': [('Hillhouse High School', 'New Haven', 'local'), ('Hartford Public High School', 'Hartford', 'local'), ('Notre Dame High School (West Haven, Connecticut)', 'West Haven', 'local'), ('South Kent School', 'South Kent', 'power'), ('Kingswood Oxford School', 'West Hartford', 'local'), ('Wilbur Cross High School', 'New Haven', 'local')],
 'DE': [('Sanford School (Delaware)', 'Hockessin', 'power'), ('Salesianum School', 'Wilmington', 'local'), ('William Penn High School (Delaware)', 'New Castle', 'local'), ('Middletown High School (Delaware)', 'Middletown', 'local'), ('Delcastle Technical High School', 'Wilmington', 'local')],
 'DC': [('Gonzaga College High School', 'Washington', 'power'), ('Archbishop Carroll High School (Washington, D.C.)', 'Washington', 'power'), ('Dunbar High School (Washington, D.C.)', 'Washington', 'local'), ('Calvin Coolidge High School', 'Washington', 'local'), ('Spingarn High School', 'Washington', 'local')],
 'FL': [('Oak Ridge High School (Orlando, Florida)', 'Orlando', 'local'), ('Miami Senior High School', 'Miami', 'local'), ('Dr. Michael M. Krop Senior High School', 'Miami', 'local'), ('Lakeland High School (Lakeland, Florida)', 'Lakeland', 'local'), ('Dillard High School', 'Fort Lauderdale', 'local'), ('Lake Highland Preparatory School', 'Orlando', 'power'), ('Mainland High School', 'Daytona Beach', 'local'), ('Calvary Christian Academy (Florida)', 'Fort Lauderdale', 'power')],
 'GA': [('Wheeler High School (Georgia)', 'Marietta', 'power'), ('Pace Academy', 'Atlanta', 'power'), ('Westlake High School (Atlanta, Georgia)', 'Atlanta', 'local'), ('Southwest DeKalb High School', 'Decatur', 'local'), ('Norcross High School', 'Norcross', 'local'), ('Milton High School (Georgia)', 'Milton', 'local'), ('Collins Hill High School', 'Suwanee', 'local'), ('Southwest Atlanta Christian Academy', 'Atlanta', 'local'), ('McEachern High School', 'Powder Springs', 'local')],
 'HI': [('Punahou School', 'Honolulu', 'power'), ('Saint Louis School', 'Honolulu', 'local'), ('Kamehameha Schools', 'Honolulu', 'local'), ('ʻIolani School', 'Honolulu', 'local')],
 'ID': [('Boise High School', 'Boise', 'local'), ('Centennial High School (Boise, Idaho)', 'Boise', 'local'), ('Mountain View High School (Meridian, Idaho)', 'Meridian', 'local'), ('Borah High School', 'Boise', 'local'), ('Capital High School (Boise, Idaho)', 'Boise', 'local')],
 'IL': [('Simeon Career Academy', 'Chicago', 'power'), ('Whitney M. Young Magnet High School', 'Chicago', 'power'), ('Morgan Park High School', 'Chicago', 'local'), ('St. Joseph High School (Westchester, Illinois)', 'Westchester', 'power'), ('Proviso East High School', 'Maywood', 'local'), ('Thornton Township High School', 'Harvey', 'local'), ('Peoria Manual Academy', 'Peoria', 'local'), ('King College Prep High School', 'Chicago', 'local'), ('Farragut Career Academy', 'Chicago', 'local')],
 'IN': [('Lawrence North High School', 'Indianapolis', 'power'), ('North Central High School (Indianapolis)', 'Indianapolis', 'local'), ('Crispus Attucks High School (Indianapolis)', 'Indianapolis', 'local'), ('New Albany High School (Indiana)', 'New Albany', 'local'), ('Brebeuf Jesuit Preparatory School', 'Indianapolis', 'local'), ('Pike High School (Indianapolis)', 'Indianapolis', 'local'), ('Anderson High School (Indiana)', 'Anderson', 'local'), ('Springs Valley High School', 'French Lick', 'local')],
 'IA': [('Valley High School (West Des Moines, Iowa)', 'West Des Moines', 'local'), ('Washington High School (Cedar Rapids, Iowa)', 'Cedar Rapids', 'local'), ('Iowa City West High School', 'Iowa City', 'local'), ('Roosevelt High School (Des Moines, Iowa)', 'Des Moines', 'local'), ('Ames High School', 'Ames', 'local')],
 'KS': [('Wichita East High School', 'Wichita', 'local'), ('Bishop Miege High School', 'Roeland Park', 'power'), ('Wyandotte High School', 'Kansas City', 'local'), ('Lawrence High School (Kansas)', 'Lawrence', 'local'), ('Blue Valley Northwest High School', 'Overland Park', 'local'), ('Wichita Heights High School', 'Wichita', 'local')],
 'KY': [('Louisville Male High School', 'Louisville', 'local'), ('Trinity High School (Louisville)', 'Louisville', 'power'), ('Ballard High School (Louisville, Kentucky)', 'Louisville', 'local'), ('Lexington Catholic High School', 'Lexington', 'local'), ('Scott County High School (Kentucky)', 'Georgetown', 'local'), ('Fern Creek High School', 'Louisville', 'local')],
 'LA': [('Isidore Newman School', 'New Orleans', 'power'), ('Brother Martin High School', 'New Orleans', 'local'), ('St. Augustine High School (New Orleans)', 'New Orleans', 'local'), ('Scotlandville Magnet High School', 'Baton Rouge', 'local'), ('Peabody Magnet High School', 'Alexandria', 'local'), ('Huntington High School (Shreveport, Louisiana)', 'Shreveport', 'local'), ('Southern University Laboratory School', 'Baton Rouge', 'local')],
 'ME': [('Cheverus High School', 'Portland', 'local'), ('Bangor High School', 'Bangor', 'local'), ('Brunswick High School (Maine)', 'Brunswick', 'local'), ('Gould Academy', 'Bethel', 'power')],
 'MD': [('DeMatha Catholic High School', 'Hyattsville', 'power'), ('Mount Saint Joseph High School', 'Baltimore', 'power'), ('Dunbar High School (Baltimore)', 'Baltimore', 'local'), ('Montrose Christian School', 'Rockville', 'power'), ('Eleanor Roosevelt High School (Maryland)', 'Greenbelt', 'local'), ('Montgomery Blair High School', 'Silver Spring', 'local'), ('Calvert Hall College High School', 'Towson', 'local')],
 'MA': [('Cushing Academy', 'Ashburnham', 'power'), ('Buckingham Browne & Nichols', 'Cambridge', 'local'), ('Worcester Academy', 'Worcester', 'power'), ('Cambridge Rindge and Latin School', 'Cambridge', 'local'), ('Brookline High School', 'Brookline', 'local'), ('St. Mark\'s School (Massachusetts)', 'Southborough', 'local'), ('Brockton High School', 'Brockton', 'local')],
 'MI': [('Southwestern High School (Detroit)', 'Detroit', 'local'), ('Detroit Country Day School', 'Beverly Hills', 'power'), ('Pershing High School (Detroit)', 'Detroit', 'local'), ('Saginaw High School', 'Saginaw', 'local'), ('Flint Northwestern High School', 'Flint', 'local'), ('Everett High School (Lansing, Michigan)', 'Lansing', 'local'), ('Romulus High School', 'Romulus', 'local'), ('Kalamazoo Central High School', 'Kalamazoo', 'local'), ('Cass Technical High School', 'Detroit', 'local')],
 'MN': [('Hopkins High School', 'Minnetonka', 'power'), ('North Community High School', 'Minneapolis', 'local'), ('Cretin-Derham Hall High School', 'Saint Paul', 'local'), ('Apple Valley High School (Minnesota)', 'Apple Valley', 'local'), ('Minnehaha Academy', 'Minneapolis', 'local'), ('Park Center Senior High School', 'Brooklyn Park', 'local')],
 'MS': [('Jim Hill High School', 'Jackson', 'local'), ('Provine High School', 'Jackson', 'local'), ('Callaway High School (Mississippi)', 'Jackson', 'local'), ('Lanier High School (Jackson, Mississippi)', 'Jackson', 'local'), ('Starkville High School', 'Starkville', 'local'), ('Murrah High School', 'Jackson', 'local')],
 'MO': [('Vashon High School', 'St. Louis', 'local'), ('Chaminade College Preparatory School (Missouri)', 'St. Louis', 'power'), ('Lincoln College Preparatory Academy', 'Kansas City', 'local'), ('Webster Groves High School', 'Webster Groves', 'local'), ('Kickapoo High School', 'Springfield', 'local'), ('Central High School (Kansas City, Missouri)', 'Kansas City', 'local'), ('Christian Brothers College High School', 'St. Louis', 'local')],
 'MT': [('Billings West High School', 'Billings', 'local'), ('Great Falls High School', 'Great Falls', 'local'), ('Sentinel High School (Missoula, Montana)', 'Missoula', 'local'), ('Butte High School', 'Butte', 'local')],
 'NE': [('Omaha Central High School', 'Omaha', 'local'), ('Omaha North High School', 'Omaha', 'local'), ('Lincoln High School (Lincoln, Nebraska)', 'Lincoln', 'local'), ('Bellevue West High School', 'Bellevue', 'local'), ('Creighton Preparatory School', 'Omaha', 'local')],
 'NV': [('Bishop Gorman High School', 'Las Vegas', 'power'), ('Durango High School (Nevada)', 'Las Vegas', 'local'), ('Centennial High School (Las Vegas)', 'Las Vegas', 'local'), ('Canyon Springs High School', 'North Las Vegas', 'local')],
 'NH': [('Phillips Exeter Academy', 'Exeter', 'local'), ('New Hampton School', 'New Hampton', 'power'), ('Tilton School', 'Tilton', 'power')],
 'NJ': [('St. Anthony High School (New Jersey)', 'Jersey City', 'power'), ('St. Patrick High School (Elizabeth, New Jersey)', 'Elizabeth', 'power'), ('Roselle Catholic High School', 'Roselle', 'power'), ('Paterson Catholic High School', 'Paterson', 'local'), ('St. Benedict\'s Preparatory School', 'Newark', 'power'), ('Camden High School (New Jersey)', 'Camden', 'local'), ('The Patrick School', 'Hillside', 'power'), ('Seton Hall Preparatory School', 'West Orange', 'local')],
 'NM': [('Albuquerque Academy', 'Albuquerque', 'local'), ('Eldorado High School (Albuquerque, New Mexico)', 'Albuquerque', 'local'), ('Manzano High School', 'Albuquerque', 'local'), ('Las Cruces High School', 'Las Cruces', 'local'), ('Rio Grande High School (New Mexico)', 'Albuquerque', 'local'), ('Highland High School (Albuquerque, New Mexico)', 'Albuquerque', 'local')],
 'NY': [('Christ the King Regional High School', 'Queens', 'power'), ('Rice High School (New York City)', 'Harlem', 'power'), ('Abraham Lincoln High School (Brooklyn)', 'Brooklyn', 'power'), ('Archbishop Molloy High School', 'Queens', 'power'), ('Bishop Loughlin Memorial High School', 'Brooklyn', 'local'), ('Power Memorial Academy', 'Manhattan', 'local'), ('Boys and Girls High School', 'Brooklyn', 'local'), ('Long Island Lutheran Middle and High School', 'Brookville', 'power'), ('Cardinal Hayes High School', 'Bronx', 'local')],
 'NC': [('Emsley A. Laney High School', 'Wilmington', 'local'), ('Charlotte Christian School', 'Charlotte', 'power'), ('Word of God Christian Academy', 'Raleigh', 'local'), ('Hillside High School (North Carolina)', 'Durham', 'local'), ('Ravenscroft School', 'Raleigh', 'local'), ('Wesleyan Christian Academy', 'High Point', 'local'), ('Southwest Guilford High School', 'High Point', 'local'), ('Charlotte Latin School', 'Charlotte', 'local')],
 'ND': [('Fargo North High School', 'Fargo', 'local'), ('Bismarck High School', 'Bismarck', 'local'), ('Grand Forks Central High School', 'Grand Forks', 'local'), ('Minot High School', 'Minot', 'local')],
 'OH': [('St. Vincent–St. Mary High School', 'Akron', 'power'), ('Northland High School (Columbus, Ohio)', 'Columbus', 'local'), ('Purcell Marian High School', 'Cincinnati', 'local'), ('Withrow High School', 'Cincinnati', 'local'), ('Shaker Heights High School', 'Shaker Heights', 'local'), ('Cleveland Heights High School', 'Cleveland Heights', 'local'), ('St. Edward High School (Lakewood, Ohio)', 'Lakewood', 'power'), ('Garfield Heights High School', 'Garfield Heights', 'local'), ('Lima Senior High School', 'Lima', 'local')],
 'OK': [('Douglass High School (Oklahoma City)', 'Oklahoma City', 'local'), ('Putnam City High School', 'Oklahoma City', 'local'), ('Booker T. Washington High School (Tulsa, Oklahoma)', 'Tulsa', 'local'), ('Bishop McGuinness Catholic High School (Oklahoma)', 'Oklahoma City', 'local'), ('Edmond Memorial High School', 'Edmond', 'local'), ('Millwood High School', 'Oklahoma City', 'local')],
 'OR': [('Jefferson High School (Portland, Oregon)', 'Portland', 'local'), ('Lake Oswego High School', 'Lake Oswego', 'local'), ('Grant High School (Portland, Oregon)', 'Portland', 'local'), ('South Medford High School', 'Medford', 'local'), ('Benson Polytechnic High School', 'Portland', 'local'), ('Lakeridge High School', 'Lake Oswego', 'local')],
 'PA': [('Roman Catholic High School', 'Philadelphia', 'power'), ('Lower Merion High School', 'Ardmore', 'local'), ('Chester High School', 'Chester', 'local'), ('Neumann Goretti High School', 'Philadelphia', 'power'), ('Simon Gratz High School', 'Philadelphia', 'local'), ('Penn Wood High School', 'Lansdowne', 'local'), ('Overbrook High School (Pennsylvania)', 'Philadelphia', 'local'), ('Imhotep Institute Charter High School', 'Philadelphia', 'local')],
 'RI': [('Bishop Hendricken High School', 'Warwick', 'local'), ('La Salle Academy', 'Providence', 'local'), ('Providence Country Day School', 'East Providence', 'local'), ('Classical High School (Providence, Rhode Island)', 'Providence', 'local'), ('Central High School (Providence, Rhode Island)', 'Providence', 'local')],
 'SC': [('Ridge View High School', 'Columbia', 'local'), ('Spartanburg High School', 'Spartanburg', 'local'), ('Socastee High School', 'Myrtle Beach', 'local'), ('Gray Collegiate Academy', 'West Columbia', 'local'), ('Eastside High School (Taylors, South Carolina)', 'Taylors', 'local'), ('Lower Richland High School', 'Hopkins', 'local')],
 'SD': [('Washington High School (Sioux Falls, South Dakota)', 'Sioux Falls', 'local'), ('Lincoln High School (Sioux Falls, South Dakota)', 'Sioux Falls', 'local'), ('Rapid City Central High School', 'Rapid City', 'local'), ('Roosevelt High School (Sioux Falls, South Dakota)', 'Sioux Falls', 'local')],
 'TN': [('East High School (Memphis, Tennessee)', 'Memphis', 'local'), ('Whitehaven High School', 'Memphis', 'local'), ('Melrose High School (Memphis, Tennessee)', 'Memphis', 'local'), ('Hamilton High School (Memphis, Tennessee)', 'Memphis', 'local'), ('Pearl-Cohn Magnet High School', 'Nashville', 'local'), ('Ensworth School', 'Nashville', 'local'), ('Brentwood Academy', 'Brentwood', 'power'), ('Memphis University School', 'Memphis', 'local')],
 'TX': [('Lincoln High School (Dallas)', 'Dallas', 'local'), ('South Oak Cliff High School', 'Dallas', 'local'), ('Duncanville High School', 'Duncanville', 'power'), ('Justin F. Kimball High School', 'Dallas', 'local'), ('Jack Yates High School', 'Houston', 'local'), ('Westbury Christian School', 'Houston', 'power'), ('Bellaire High School (Texas)', 'Bellaire', 'local'), ('Lake Highlands High School', 'Dallas', 'local'), ('Montrose Christian School', 'x', 'skip'), ('Arlington Martin High School', 'Arlington', 'local'), ('Oak Ridge High School (Conroe, Texas)', 'Conroe', 'local')],
 'UT': [('Skyline High School (Utah)', 'Salt Lake City', 'local'), ('Lone Peak High School', 'Highland', 'local'), ('Juan Diego Catholic High School', 'Draper', 'local'), ('Olympus High School', 'Holladay', 'local'), ('Timpview High School', 'Provo', 'local')],
 'VT': [('Rice Memorial High School', 'South Burlington', 'local'), ('Burlington High School (Vermont)', 'Burlington', 'local'), ('Vermont Academy', 'Saxtons River', 'power'), ('Champlain Valley Union High School', 'Hinesburg', 'local')],
 'VA': [('Paul VI Catholic High School', 'Chantilly', 'power'), ('Hargrave Military Academy', 'Chatham', 'power'), ('Bishop O\'Connell High School', 'Arlington', 'power'), ('Flint Hill School', 'Oakton', 'local'), ('Bethel High School (Hampton, Virginia)', 'Hampton', 'local'), ('Booker T. Washington High School (Norfolk, Virginia)', 'Norfolk', 'local'), ('Fork Union Military Academy', 'Fork Union', 'power'), ('St. Christopher\'s School', 'Richmond', 'local')],
 'WA': [('Garfield High School (Seattle)', 'Seattle', 'power'), ('Rainier Beach High School', 'Seattle', 'local'), ('O\'Dea High School', 'Seattle', 'local'), ('Franklin High School (Seattle)', 'Seattle', 'local'), ('Federal Way High School', 'Federal Way', 'local'), ('Seattle Preparatory School', 'Seattle', 'local'), ('Mount Rainier High School', 'Des Moines', 'local')],
 'WV': [('Huntington High School (West Virginia)', 'Huntington', 'local'), ('Wheeling Central Catholic High School', 'Wheeling', 'local'), ('Capital High School (Charleston, West Virginia)', 'Charleston', 'local'), ('East Bank High School', 'East Bank', 'local'), ('Morgantown High School', 'Morgantown', 'local')],
 'WI': [('Brookfield Central High School', 'Brookfield', 'local'), ('Washington High School (Milwaukee)', 'Milwaukee', 'local'), ('Nicolet High School', 'Glendale', 'local'), ('Rufus King International High School', 'Milwaukee', 'local'), ('Whitefish Bay High School', 'Whitefish Bay', 'local'), ('Vincent High School', 'Milwaukee', 'local')],
 'WY': [('Cheyenne East High School', 'Cheyenne', 'local'), ('Natrona County High School', 'Casper', 'local'), ('Kelly Walsh High School', 'Casper', 'local'), ('Laramie High School', 'Laramie', 'local')],
}
NATIONAL = [('Montverde Academy', 'Montverde, FL'), ('IMG Academy', 'Bradenton, FL'), ('Oak Hill Academy (Virginia)', 'Mouth of Wilson, VA'), ('La Lumiere School', 'La Porte, IN'), ('Sunrise Christian Academy', 'Bel Aire, KS'), ('Brewster Academy', 'Wolfeboro, NH'), ('Wasatch Academy', 'Mount Pleasant, UT'), ('Findlay Prep', 'Henderson, NV'), ('Huntington Prep School', 'Huntington, WV'), ('Prolific Prep', 'Napa, CA'), ('Hillcrest Prep Academy', 'Phoenix, AZ'), ('Link Academy', 'Branson, MO'), ('AZ Compass Prep', 'Chandler, AZ')]

# fame: the all-time list in report.js and the current NBA rosters in real.js
GOATS = set(re.findall(r"\['([^']+)', '(?:PG|SG|SF|PF|C)'", open(os.path.join(ROOT, 'src', 'report.js'), encoding='utf8').read()))
CURRENT = set(re.findall(r'\["([^"]+)", "(?:PG|SG|SF|PF|C)", \d+, (\d+)', open(os.path.join(ROOT, 'src', 'real.js'), encoding='utf8').read()) and [m[0] for m in re.findall(r'\["([^"]+)", "(?:PG|SG|SF|PF|C)", \d+, (\d+)', open(os.path.join(ROOT, 'src', 'real.js'), encoding='utf8').read())])
OVR = {m[0]: int(m[1]) for m in re.findall(r'\["([^"]+)", "(?:PG|SG|SF|PF|C)", \d+, (\d+)', open(os.path.join(ROOT, 'src', 'real.js'), encoding='utf8').read())}

TEAMS = 'Hawks|Celtics|Nets|Hornets|Bulls|Cavaliers|Mavericks|Nuggets|Pistons|Warriors|Rockets|Pacers|Clippers|Lakers|Grizzlies|Heat|Bucks|Timberwolves|Pelicans|Knicks|Thunder|Magic|76ers|Suns|Trail Blazers|Kings|Spurs|Raptors|Jazz|Wizards|SuperSonics|Bullets|Supersonics|Braves|Royals|Hornets'
def search(q):
    f = os.path.join(CACHE, hashlib.md5(('S:' + q).encode()).hexdigest() + '.json')
    if os.path.exists(f): return json.load(open(f))
    url = 'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=5&search=' + urllib.parse.quote(q)
    try: r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode('utf8'))[1]
    except Exception: r = []
    json.dump(r, open(f, 'w')); return r
def alumni(text, prose=False):
    out = []
    for line in text.split('\n'):
        l = line.strip()
        if not (l.startswith('*') or l.startswith('|')): continue
        if not re.search(r'\bNBA\b|National Basketball Association|basketball|' + TEAMS, l, re.I) and not any(n in l for n in GOATS): continue
        if re.search(r'\bWNBA\b|women', l, re.I) and not re.search(r'\bNBA\b', re.sub(r'WNBA', '', l)): continue
        name = None
        for m in re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', l):
            cand = re.sub(r'\s*\(.*?\)$', '', (m.group(2) or m.group(1)).strip())
            if len(cand.split()) >= 2 and len(cand) <= 40 and not re.search(r'NBA|League|University|College|High School|Basketball|Association|Draft|Olympic|Team|Award|\bState\b|Tar Heels|Wildcats|Blue Devils|Jayhawks|Huskies|Tigers|Bulldogs|Gators|Spartans|Wolverines|Seminoles|Cardinals|Bruins|Trojans|Hoosiers|Volunteers|Razorbacks|Longhorns|Buckeyes|Hurricanes|Orange|\b(' + TEAMS + r')\b|\d', cand): name = cand; break
        if not name: continue
        if len(name.split()) < 2 or len(name) > 40 or re.search(r'NBA|League|University|College|High School|Basketball|Association|Draft|Olympic|Team|Award', name): continue
        note = re.sub(r'<ref.*?(</ref>|/>)', '', l, flags=re.S); note = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]', r'\1', note); note = re.sub(r'\{\{[^{}]*\}\}', '', note); note = re.sub(r"'''?|^[*|]+\s*", '', note).strip()
        sc = (20 if name in GOATS else 0) + (6 if re.search(r'Hall of Fame', note, re.I) else 0) + (5 if re.search(r'MVP|Most Valuable', note) else 0) + (4 if re.search(r'All-Star', note) else 0) + (2 if re.search(r'champion', note, re.I) else 0) + (2 if re.search(r'\bNBA\b', note) else 0) + (max(0, OVR.get(name, 0) - 70) * 0.5 if name in OVR else 0)
        nba = re.search(r'\bNBA\b|National Basketball Association', note) or (re.search(r'basketball', note, re.I) and re.search(r'\b(' + TEAMS + r')\b', note))
        if not nba and name not in OVR and name not in GOATS: continue   # basketball but never the NBA
        if re.search(r'owner|president|executive|general manager|superfan|singer|bodybuilder|football|Miss |actor|rapper|broadcaster|announcer|referee|WNBA|coach', note, re.I) and not re.search(r'NBA player|played in the NBA|player for', note) and name not in OVR and name not in GOATS: continue
        if re.search(r'championship|Band|Region|\b(' + TEAMS + r')\b', name): continue
        out.append({'name': name, 'note': note[:140], 'score': sc})
    for m in (re.finditer(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', text) if prose else []):   # national academies name their NBA alumni in the prose
        nm = (m.group(2) or m.group(1)).strip()
        if (nm in OVR or nm in GOATS) and not re.search(r'\b(' + TEAMS + r')\b', nm) and not any(x['name'] == nm for x in out): out.append({'name': nm, 'note': 'NBA player', 'score': (20 if nm in GOATS else 0) + 2 + (max(0, OVR.get(nm, 0) - 70) * 0.5)})
    if prose: out = [x for x in out if x['name'] in OVR or x['name'] in GOATS or (x['note'] != 'NBA player' and not re.search(r'Carolina|Tech|State|Florida|Georgia|Kentucky|Duke|Kansas|Texas|Arizona|Virginia|Oregon|Washington|Michigan|Ohio|Indiana|Iowa|Villanova|Gonzaga|Baylor|Auburn|Alabama|Tennessee|Louisville|Syracuse|Memphis|Houston|Connecticut|Purdue|Arkansas|Missouri|California|Southern', x['name']))]   # academies: drop the colleges their tables name
    seen, res = set(), []
    for x in sorted(out, key=lambda a: -a['score']):
        if x['name'] not in seen: seen.add(x['name']); res.append(x)
    return res

def school(title, st=None, prose=False):
    t = raw(title)
    if not t and st:
        base = re.sub(r'\s*\(.*\)$', '', title)
        for cand in search(base + ' ' + st)[:3] + search(base)[:3]:
            if re.search(r'School|Academy|Prep|Institute', cand): t = raw(cand); title = cand
            if t: break
    if not t: return None
    a = alumni(t, prose)
    m = re.search(r'\|\s*name\s*=\s*([^\n|]+)', t)
    nm = re.sub(r'<br\s*/?>', ' ', m.group(1)) if m else ''
    nm = re.sub(r'\[\[|\]\]|\{\{.*?\}\}|<.*?>', '', nm).strip() if m else re.sub(r'\s*\(.*\)$', '', title)
    if not nm or len(nm) > 60: nm = re.sub(r'\s*\(.*\)$', '', title)
    nm = re.sub(r' Pilots$', '', nm)
    return {'n': nm, 'alumni': [[x['name'], x['note']] for x in a[:3]], 'nNBA': len(a), 'fame': round(sum(x['score'] for x in a[:3]))}

import subprocess
STNAME = json.loads(subprocess.check_output(['node', '-e', "global.NBA={};require('./src/data.js');const A=NBA.data.STATE_ABBR,o={};for(const k in A)o[A[k]]=k;console.log(JSON.stringify(o))"], cwd=ROOT))
out = {}; total = 0
for st, lst in S.items():
    rows = []
    for title, city, typ in lst:
        if typ == 'skip': continue
        r = school(title, STNAME.get(st, ''))
        if r and not any(x['n'] == r['n'] for x in rows): r.update({'city': city, 'type': typ}); rows.append(r)
    rows.sort(key=lambda r: -r['fame']); out[st] = rows; total += len(rows)
    print(st, len(rows), ' | '.join(r['n'] + ': ' + ', '.join(a[0] for a in r['alumni']) for r in rows[:3]), file=sys.stderr)
nat = []
for title, city in NATIONAL:
    r = school(title, 'basketball prep school', True)
    if r and r['alumni']: r.update({'city': city, 'type': 'national'}); nat.append(r)
    else: print('national: no NBA alumni found for', title, file=sys.stderr)
nat.sort(key=lambda r: -r['fame'])
js = '(function (g) {\n  // GENERATED by scripts/build-hs.py: real US high schools by state (+ national boarding prep powerhouses) and their most famous NBA alumni,\n  // taken from each school\'s Wikipedia article. School row: {n, city, type: national|power|local, alumni: [[name, note]], nNBA}\n'
js += '  (g.NBA = g.NBA || {}).HS = ' + json.dumps({'states': out, 'national': nat}, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += "  if (typeof module !== 'undefined') module.exports = g.NBA;\n})(typeof window !== 'undefined' ? window : globalThis);\n"
open(os.path.join(ROOT, 'src', 'hsdata.js'), 'w', encoding='utf8').write(js)
print('schools', total, 'national', len(nat), 'states with 0:', [k for k, v in out.items() if not v], 'states with no NBA alumni at all:', [k for k, v in out.items() if not any(x['alumni'] for x in v)])
