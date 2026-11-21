/* Dorfnamen-Vorrat (Pay2Win x Popkultur), Stand 21.11.2026 aus dem Namens-Dokument übernommen.
   Schema: bekannter Name oder Titel, in dem ein Wortteil durch einen Begriff fürs Geldausgeben ersetzt ist
   (pay, buy, shop, kauf, premium, PP, cash, swipe, Mastercard, Visa) oder durch einen Spielbegriff
   (Flaggendoppler, Raubzug, Booster, Banner, Paket, Rohstoffpaket, Kriegskasse, Erlass des Adels).
   Alle Einträge sind auf höchstens 26 Zeichen geprüft, damit die Nummer davor noch ins Dorfnamenfeld passt.
   Ohne DOM: im Browser window.NAMEN_DATEN, in Node module.exports. */
(function (root) {
"use strict";
const DATEN = [
{kat: "Schauspieler und Hollywood", gruppen: [{g: "", n: [
"Brad Paytt", "Tom Cashruise", "Keanu Cashves", "Scarlett Shopansson", "Jennifer Payrence", "Will Shopmith",
"Bruce Buyllis", "Sylvester Shoppalone", "Clint Cashwood", "Harrison Shopford", "Tom Shopanks", "Robert De Kauf",
"Robert Buyney Jr.", "Angelina Buylie", "Meryl Swipeep", "Julia Shoperts", "Chris Shopsworth", "Mark Zahlberg",
"Jason Moneymoa", "Visa Diesel", "Idris Elbuy", "Hugh Cashman", "Jean-Claude Van Payme", "Charlie Shoplin",
"Buster Kaufton", "Audrey Shopburn", "Marilyn Moneyroe", "Humphrey Buygart", "Sean Cashnery", "Tom Cardy",
"Christian Bezahle", "Joaquin Shoppenix", "Danny DeVisa", "Ryan Cashling", "Margot Shoppie", "Spendaya",
"Timothée Shoplamet", "Jim Cashrey", "Eddie Murpay", "Robin Buyliams", "Adam Spendler", "Ben Shopiller",
"Owen Buylson", "Natalie Paytman", "Cate Blancard", "John Shoppolta", "Mads Mastercardsen", "Bud Spender",
"Terence Shoppill", "Klaus Kaufski", "Til Shopweiger", "Al Payccino", "Nicolas Cashrein", "Christoph Swipez"]}]},

{kat: "Musik", gruppen: [{g: "", n: [
"Ludwig van Beetshoppen", "Wolfgang Amadeus Mozahlt", "Johann Sebastian Kauf", "Elvis Preisley",
"Freddie Mastercury", "Michael Cashson", "Ed Shopran", "Bruno Cards", "Kanye Spent", "Shoop Dogg",
"Dr. Dreinbuttern", "Pay-Z", "Justin Buyber", "Lady Payga", "Kaufdonna", "Buyhanna", "Tina Kaufner",
"Phil Shoplins", "Mick Swipegger", "Helene Swiper", "Udo Zahlenberg", "Peter Mapay", "Howard Cardpendale",
"Roland Kaufer", "Wolfgang Pay-try", "Sarah Cashnor", "Mark Shopster", "Farin Kauflaub", "Kaufpino",
"Kaufwerk", "Shoppstein", "Die Toten Konten", "David Cashelhoff", "Johnny Cashrein", "50 Euro Sofortkauf"]}]},

{kat: "Deutsche Promis, TV und Comedy", gruppen: [{g: "", n: [
"Dieter Bezohlen", "Günther Jaukauf", "Hape Kaufkeling", "Otto Kaufkes", "Harald Shopmidt", "Markus Kauflanz",
"Stefan Shoppaab", "Joko und Kauflaas", "Heidi Kauflum", "Mario Kaufarth", "Horst Shoplämmer", "Tim Zahlzer",
"Horst Kauflichter", "Barbara Sale-sch", "Peter Kauflustig", "Shopmuckl", "Bibi Shopsberg", "Benjamin Shoppchen",
"Käpt'n Kaufbär", "Der Shopmann", "Wickie und die Mastercard", "Shoppberg"]}]},

{kat: "Wissenschaft, Kunst und Literatur", gruppen: [{g: "", n: [
"Albert Einkauf", "Isaac Buyton", "Charles Cardwin", "Galileo Kauflei", "Thomas Edishop", "Nikola Teslabuy",
"Marie Shoprie", "Kaufniz", "Shopkrates", "Payton", "Aristocash", "René Descardes", "Kaufuzius", "Karl Mastercarx",
"Sigmund Kaufreud", "Needzsche more Premium", "J. W. von Shoppethe", "Friedrich Shopiller", "William Shopspeare",
"Franz Kaufka", "Ernest Shoppingway", "Erich Kauftner", "Thomas Shoppmann", "Stephen Shopking", "Jules Kaufne",
"Leonardo da Visa", "Vincent van Kauf", "Paycasso", "Salvador Zahlí", "Mona Visa", "Andy Kaufhol"]}]},

{kat: "Geschichte und Politik", gruppen: [{g: "", n: [
"Julius Cäshar", "Alex der Großeinkäufer", "Dschingis Kauf", "Marco Payolo", "Tutanchakauf",
"Sollen sie Premium kaufen", "Der Shoppingkönig", "Ludwig der Schlosskäufer", "Friedrich der Teure",
"Otto von Bismastercard", "Angela Mehrkauf", "Olaf Shoppolz", "Helmut Zahl", "Gerhard Shopröder",
"Karl Kaufterbach", "Robert Shopbeck", "Friedrich Premiumerz", "Abraham Buykoln", "Theodore Buysevelt",
"Richard Nixgespart"]}]},

{kat: "Sport", gruppen: [{g: "", n: [
"Jürgen Shopp", "PP Guardiola", "Zahlatan", "Usain Bought", "Muhammad Buy", "Michael Shoppmacher",
"Lewis Kaufilton", "Sebastian Kauftel", "Dirk Kaufitzki", "Franz Kaufenbauer", "Cristiano Buynaldo",
"Lionel Payssi", "Michael Buydan", "LeBuy James", "Thomas Zahler", "Manuel Neukauf", "Toni Kaufs",
"Oliver Buyerhoff", "Jogi Kauflöw", "Roger Payderer", "Conor McKauf", "Nach Kauf ist vor Kauf"]}]},

{kat: "Star Wars", gruppen: [
{g: "Titel", n: [
"Eine neue Kreditkarte", "Eine neue Mastercard", "Die Kaufkraft erwacht", "Kauf der Sterne",
"Krieg der Kreditkarten", "Angriff der Kaufkrieger", "Die Klonkrieger shoppen", "Die Rache der Shopper",
"Die Rückkehr der Shopdi", "Der Aufstieg der Kaufkraft", "Der letzte Premiumpunkt", "Solo: A Star Wars Kauf"]},
{g: "Zitate", n: [
"Möge das Premium mit dir", "Ich bin dein Zahler", "Es ist ein Angebot!", "So kauft man das",
"Han kaufte zuerst", "Hilf mir, Premiumpunkt", "Das Premium ist stark", "Die Macht des Geldes", "Sofortkauf 66"]},
{g: "Orte, Schiffe, Dinge", n: [
"Imperialer Kaufrausch", "Der Shoppstern", "Kontozerstörer", "Premium Falcon", "Das Kreditschwert",
"Die Sith-Kreditkarte", "Jabbas Premiumpalast", "Spendor", "Zahlderaan", "Cashyyyk", "Shoppatooine",
"Cashruscant", "Payobah", "Kaufmino", "Shopwoks"]},
{g: "Figuren", n: [
"Darth Paider", "Darth Booster", "Darth Kaul", "Darth Shoppious", "Impayrator", "Obi-Wan Kenobuy",
"Luke Kaufwalker", "Prinzessin Payia", "Buy-Gon Jinn", "Graf Dookauf", "Kaufo Ren", "Pay Skywalker",
"Pay Dameron", "General Kaufvous", "Lando Cashrissian", "Boba Zahlt", "Jar Jar Buys", "Cashbacca",
"Paydawan", "Baby Shoppa"]}]},

{kat: "Film- und Serienfiguren", gruppen: [
{g: "Fantasy", n: [
"Goldemort", "Dumbleshop", "Severus Swipe", "Hermine Shoppinger", "Frodo Kauflin", "Gandalf der Zahlende",
"Shopron", "Mein Premiumschatz", "Du kaufst nix, Jon Schnee"]},
{g: "Superhelden", n: [
"Buyman", "Supershopper", "Buyron Man", "Captain Americard", "Captain Booster", "Black Mastercard",
"Thanos Swipet", "Warum so sparsam?", "Optimus Premium", "Bruce Banner", "Bannerman", "Bannerman Begins",
"Boosterman", "Paketman"]},
{g: "Action und Krimi", n: [
"Der Shoppinator", "Rocky Zahlboa", "Walter Swipe", "Tony Shoprano", "Captain Jack Shoparrow", "Indiana Buys",
"John Klick-Kauf", "Sherlock Shoplmes", "Jack Kaufer", "Tyler Spenden", "James Booster", "Der Boosterpate"]},
{g: "Horror und Monster", n: [
"Shopzilla", "Boosterzilla", "King Kauf", "Pennywaste", "Buycula", "Booster vs Kong"]},
{g: "Sonstige", n: [
"Forrest Kauft", "Marty McBuy", "Mary Shoppins", "Ich habe die Kreditkarte", "Booster Keaton", "Boosterella",
"Booster Dogg", "Boosterbär", "Boosterpunk"]}]},

{kat: "Comics und Cartoons", gruppen: [{g: "", n: [
"Donald Shop", "Dagobert Kauf", "Entenhausen Premium", "Micky Kaufs", "Goofy Premium", "Tick, Trick und Kauf",
"Lucky Buy", "Die Daltons kaufen", "Tim und Shoppy", "Kapitän Kauf", "Spirou und Kaufantas",
"Kauferix und Obuylix", "Mastercardulix", "Garfield Premium", "Snoopy shoppt", "Calvin und Kaufbes",
"Homer Shopson", "Bart Kaufson", "Rick and Shopty", "Futurashop", "Bender Premium", "SpongeBob Shoppants",
"Patrick Premium", "Bikini Shoptom", "Tom und Shoppy", "Beep Beep, Premium", "Kaufy Coyote"]}]},

{kat: "Anime und Manga", gruppen: [{g: "", n: [
"Dragon Ball PP", "Son Gokauf", "Prinz Vegeta Premium", "Kamehamekauf", "Shopper Saiyajin", "Naruto Shoppuden",
"Monkey D. Kauffy", "One Piece: Der Kauf", "Strohhut-Shopper", "Pikapay", "Paykachu", "Pokébuy",
"Pokémon: Kauf sie alle", "Schnapp sie dir alle", "Ash Ketchshop", "Attack on Premium", "Angriff auf Premium",
"Death Shop", "Sailor Moneymoon", "Yu-Gi-Shop", "Digishop", "Shopmurai", "Studio Shopbli",
"Chihiros Kaufreise", "Mein Nachbar Premium"]}]},

{kat: "Videospiele", gruppen: [{g: "", n: [
"Super Buyrio", "Mario Kauft", "Luigis Shopsion", "Bowsers Kaufburg", "Shoponic", "Sonic the Shophog",
"The Legend of Shopda", "Breath of the Kauf", "Counter-Shop", "Counter-Strike: Kauf", "Rush B, kauf AWP",
"Minekauf", "Creeper, aw Premium", "Fortnite: Shop-Season", "Victory Buyale", "Battle Pay",
"World of Shopcraft", "Leeroy Shopkins", "Dark Shops", "Praise the Premium", "GTA: Shop Andreas",
"Grand Theft Premium", "Need for Shop", "Call of Buyty", "FIFA Ultimate Shop", "Candy Crush Premium",
"Angry Buys", "Tetris: Kaufblock", "Pac-Shop", "Half-Life 3: Gekauft", "Clash of Premium", "Shopkemon",
"Geralt von Visa", "Lara Bought", "Bannerlord"]}]},

{kat: "Märchen und Mythologie", gruppen: [
{g: "Märchen", n: [
"Rumpelshopzchen", "Shoppenstilzchen", "Hans im Kaufglück", "Der Froshopkönig", "Dornröshoppen",
"Rotkäppchen Premium", "Der Wolf und die 7 PP", "Tischlein, kauf dich", "Goldesel Premium",
"Bremer Shopmusikanten"]},
{g: "Mythologie und Sagen", n: [
"Zeus der Käufer", "Shopseidon", "Shoprodite", "Herakauf", "Der Kauf des Midas", "König Buydas", "Shopmedusa",
"Trojanisches Shoppferd", "Odyshoppeus", "Walhall Premium", "Thors Kaufhammer", "Loki shoppt", "Excalibuy",
"König Kaufus", "Der heilige Kaufgral"]}]},

{kat: "Filmtitel", gruppen: [
{g: "Herr der Ringe und Fantasy", n: [
"Die Gekauften", "Die zwei Kreditkarten", "Die Rückkehr des Käufers", "Eine unerwartete Abbuchung",
"Der Herr der Premiumpunkte", "Die Chroniken von Shopnia", "Booster of the Rings", "Herr der Preise"]},
{g: "Harry Potter", n: [
"Der Stein der Preise", "Die Kammer des Warenkorbs", "Der Gefangene des Shops", "Der Feuerkauf",
"Der Order des Phönix", "Der Vollkaufprinz"]},
{g: "Marvel und DC", n: [
"Avengers: Endkauf", "Avengers: Raubzug", "Der dunkle Shopper", "The Dark Booster", "Buyman Begins",
"Man of Visa", "Doctor Spend", "Thor: Kaufnarök", "Ant-Man and the Warenkorb", "Buy-Men"]},
{g: "Action und Thriller", n: [
"Mission: Ausverkauft", "Fluch der Kreditkarte", "Am Ende des Guthabens", "Jäger des Kontostands",
"Der letzte Einkauf", "Mad Max: Kaufrausch", "Mad Max: Raubzug", "Rambo: First Buy", "Rambo: First Raubzug",
"Shoppredator", "Spend", "Buy Boys", "Inglourious Buystards", "Konto entfesselt",
"The Fast and the Shopping", "Kauf Driver", "Shoppool", "Der Blitz-Kauf", "Full Metal Kreditkarte",
"Full Metal Raubzug", "Full Metal Sofortkauf", "Raubzug Now", "Sofortkauf Now", "Kaufrausch Now",
"Kriegskasse Now", "Der letzte Raubzug", "Der weiße Raubzug", "Sieben Raubzüge", "Sieben Premiumpakete",
"Sieben Pakete", "Sieben Sofortkäufe", "Sieben Adelserlasse"]},
{g: "Klassiker und Drama", n: [
"Der Payte", "Der Payte II: Nachgekauft", "Der Pate: Das Paket", "Der Pate: Raubzug", "Der Pate: Adelserlass",
"Buyfellas", "Cashface", "Cashsino", "Wolf of Shopping Street", "Die Verkauften", "Kauftanic", "Das Bought",
"Das Schweigen der Sparer", "Der weiße Shophai", "Kauf Fiction", "Paket Fiction", "Erste Regel des Buy Clubs",
"Raubzug Club", "Vom Konto verweht", "Flug übers Premiumnest"]},
{g: "Horror und Mystery", n: [
"The Shopping", "Du wirst auch shoppen", "Shop oder stirb", "Paket oder stirb", "Erlass oder stirb",
"Doppelflagge oder stirb", "Lieblings-Premiumpaket?", "Shoppenheimer", "Boosterheimer", "Bannerheimer",
"Paketheimer", "Shoption", "Matrix Reaufgeladen", "Die rote Kreditkarte", "Das rote Banner", "Shoppageddon",
"Paketgeddon"]},
{g: "Sci-Fi und Blockbuster", n: [
"Avatar: Der Weg des Geldes", "Jurassic Shop", "Shoppassic Park", "Boosterassic Park", "Bannerassic Park",
"Paketassic Park", "Raubzug Park", "Flaggendoppler Park", "Premium Park", "Visa Park",
"E.T. will Premium aufladen", "300 Premiumpunkte", "Trojanisches Premiumpaket", "Der Premiumianer",
"Der Da Visa Code", "Der Visa-Code", "Der Swipe-Code", "Der PP-Code", "Der Sofortkauf-Code",
"Flaggendoppler Code", "Der Kriegskassen-Code", "Der Adels-Code", "Booster Trek", "Star Shop"]},
{g: "Animation und Familie", n: [
"Buy Story", "Paket Story", "Die Kaufkönigin", "Kauf jetzt los", "Der König der Käufer", "Price Age",
"Madagascash", "Kaufu Panda", "Shopmania", "Die Premium AG", "Die Unbezahlbaren", "Spenderella", "Payocchio",
"Peter Pay", "Lass dein Premium herab", "Buynions", "Grinch stahl das Premium", "Aladdins Wunderkarte"]},
{g: "Komödie und Romance", n: [
"Pretty Shopping", "Dirty Shopping", "Preis", "Buys Brothers", "Men in Black Card", "Cashbusters",
"Boosterbusters", "Bannerbusters", "Paketbusters", "Premiumbusters", "Kaufbusters", "Shopover",
"Der Teufel trägt Premium", "Tatsächlich Premium", "Ziemlich teure Freunde"]},
{g: "Deutsche Filme", n: [
"Lola shoppt", "Der Shop des Manitu", "(T)Raumschiff Premium", "Untergang des Kontostands", "Keingeldhasen",
"Die Kaufwelle", "Fack ju Shoppte", "Honig im Warenkorb", "Werner: Kaufhart", "Otto: Der Kauf"]},
{g: "Reihen, Royale und Reloaded", n: [
"Booster Reloaded", "Doppler Reloaded", "Kriegskasse Reloaded", "Adelserlass Reloaded", "Premium Reloaded",
"Visa Reloaded", "Kauf Reloaded", "PP Reloaded", "Raubzug Royale", "Banner Royale", "Paket Royale",
"Rohstoffpaket Royale", "Kriegskasse Royale", "Flaggendoppler Royale", "Kaufrausch Royale", "Premium Royale",
"Visa Royale", "Swipe Royale", "PP Royale", "Mastercard Royale", "Moneywaste Royale", "Booster Wars",
"Banner Wars", "Paket Wars", "Kriegskasse Wars", "Adelserlass Wars", "Flaggendoppler Wars", "Premium Wars",
"Visa Wars", "Kauf Wars", "Mastercard Wars", "Swipe Wars", "Kriegskasse Begins", "Adelserlass Begins",
"Flaggendoppler Begins"]},
{g: "Drama und Klassiker, Nachtrag", n: [
"Der Käufer James Ryan", "Apocashlypse Now", "Der mit dem Geld wirft", "Kaufiator", "Bravecard",
"Good Will Shopping", "A Beautiful Buy", "Pay Man", "Show me the Premium!", "American Buyty", "Cashgo",
"Shopmento", "Buy City", "V wie Verschwendung", "Das Geld der Anderen"]},
{g: "Sci-Fi und Fantasy, Nachtrag", n: [
"Blade Shopper", "Alien: Das Paket", "Payometheus", "Beam mich hoch, Premium", "Premlins",
"Jumanji: Ab in den Shop", "Die Mastercard-Maske", "Shopping Games: Sale", "Dune: Der Sofortkauf"]},
{g: "Krimi und Heist", n: [
"Shopean's Eleven", "Boosters Eleven", "Pakets Eleven", "Ocean's Kriegskasse", "Swipes Out", "Payrasite",
"Der Kauf", "Das Kriegskassen-Kartell", "Das Premium-Kartell", "Das Kauf-Kartell", "Das Mastercard-Komplott",
"Die Kriegskassen-Akte", "Die Adels-Akte"]},
{g: "Horror, Nachtrag", n: [
"Payscho", "Die Preise", "Der Exoshopzist", "Shoppergeist", "Nightmare im Premiumshop", "Final Abbuchung",
"Resident Shopping", "I Am Spending", "Kaufzilla", "Zahlzilla", "Swipegeddon", "Bannergeddon", "Boostenstein"]},
{g: "Modernes Kino", n: [
"Cash Away", "Arrival: Das Paket kommt", "Limitlos shoppen", "The Shopping Network", "Mamma Visa",
"Sale Sale Land", "Swipelash", "Buyrdman", "Der Shopker", "Einmal in Shopllywood", "Bis(s) zum letzten PP",
"Buybie", "Shop Gun", "Top Gun: Maverkauf", "Kaufaman", "Wonder Shopping"]},
{g: "Animation, Nachtrag", n: [
"Payana", "Sold", "Mall-E", "Cards", "Pay Up", "Shopatouille", "Buymbi", "Dumbuy", "Kaufzan", "Kaufkules",
"Payohontas", "Kaufwittchen", "Der Preis und das Biest", "Probier's mal mit Premium"]},
{g: "Komödie und deutsche Filme, Nachtrag", n: [
"Karte Kid", "Buywatch", "Swipe Club", "Knockin' on Premium's Door", "Mastercard Manta", "Kein Rabatt",
"Der kaufende Mann", "Shoppenallee", "Die schwarze Karte", "Shoppen für Anfänger"]},
{g: "Sterne, Protokolle, Fluch und Jäger", n: [
"Der Boosterstern", "Der Bannerstern", "Der Paketstern", "Der Adelsstern", "Der Kaufstern", "Der Premiumstern",
"Das Banner-Protokoll", "Das Paket-Protokoll", "Das Adels-Protokoll", "Das Shop-Protokoll",
"Fluch des Doppelns", "Fluch des Sofortkaufs", "Fluch der PP", "Fluch der Kriegskasse",
"Jäger des PP-Schatzes", "Jäger der Kriegskasse", "Pakete des Zorns", "Paketinator", "Swipeinator",
"Top Booster", "Doppel oder nichts", "Premium Now", "Mastercard Now", "Kauf Now", "Adelserlass Now",
"PP Wars", "PP Begins", "Kaufheimer", "Der Reinbutterer", "Der Kaufrausch-Clan"]},
{g: "Flaggendoppler", n: [
"Die zwei Flaggendoppler", "Angriff der Flaggendoppler", "Der Flaggendoppler", "Die Flaggendoppler-Saga",
"Flaggendoppler Impossible", "Der letzte Flaggendoppler", "Flaggendoppler-Dynastie"]},
{g: "Raubzug", n: [
"Herr der Raubzüge", "Die Rückkehr des Raubzugs", "Raubzug der Premiumritter", "Raubzug 66",
"Raubzug Impossible", "Der Raubzugkönig", "Raubzug nach Kaufstadt", "Der dunkle Raubzug",
"Einmal Raubzug, immer", "Nachts im Raubzug", "Raubzug der Verlorenen", "Raubzug Jones",
"Zurück zum Raubzug", "Die Raubzug-Verschwörung"]},
{g: "Banner und Booster", n: [
"Herr der Booster", "Herr der Banner", "Die Banner-Brigade", "Banner im Wind", "Bannervegas", "Bannerpool",
"Das Banner-Imperium", "Star Banner", "Der Bannerpate"]},
{g: "Paket und Rohstoffpaket", n: [
"Das fünfte Paket", "Paketlantis", "Schrödingers Paket", "Mission: Rohstoffpaket", "Das Paket des Adels",
"Rohstoffpaket-Raub", "Herr der Rohstoffpakete", "Das letzte Rohstoffpaket", "Big Paket",
"Pakete im Nebel"]},
{g: "Kriegskasse", n: [
"Herr der Kriegskasse", "Die Kriegskasse", "Die dunkle Kriegskasse", "Kriegskasse 2: Nachschub",
"Die Kriegskasse erwacht", "Der Kriegskassenkönig", "Kriegskasse leer?", "Kriegskasse unter Feuer"]},
{g: "Erlass des Adels", n: [
"Der Erlass des Adels", "Erlass des Adels III", "Die Erlass-Dynastie", "Adelserlass Returns",
"Herr der Adelserlasse", "Erlass des Adels: Sale", "Die Rache des Adels", "Angriff des Adels",
"Der Adelsrausch"]}]},

{kat: "Serientitel", gruppen: [
{g: "US-Serien", n: [
"Breaking Buy", "Breaking Booster", "Breaking Premium", "Game of Shops", "Game of Raubzüge",
"Game of Premium", "Banner of Thrones", "The Walking Raubzug", "Spender Things", "Stranger Paket",
"Stranger Shops", "Haus des Shoppens", "Haus des Raubzugs", "Haus des Paketes", "Haus des Premiums",
"Haus des Sofortkaufs", "Spend Game", "Raubzug Game", "Premium Game", "Squid Kauf", "Spends", "Boosters",
"Premiums", "How I Met Your Booster", "How I Met Your Visa", "The Big Buy Theory", "The Big Booster Theory",
"Die Shoppsons", "Die Boostersons", "Die Kaufsons", "South Shop", "South Booster", "South Premium",
"Family Raubzug", "Family Premium", "Peaky Shoppers", "Peaky Boosters", "Peaky Zahler", "Dark Booster",
"Dark Premium", "Narcos: Rohstoffpaket", "Narcos: Premium", "Prison Raubzug", "Prison Shop",
"Better Call Booster", "Better Call Shopper", "The Boosteranos", "The Shopranos", "Sex and the Kriegskasse",
"Sex and the Mastercard", "Two and a Half Shopper", "Chernobuy", "The Last of Buy", "Mad Spend",
"True Kauftective", "Black Shopper", "Silicon Raubzug"]},
{g: "Deutsches Fernsehen", n: [
"Kauftort", "Raubzug-Tatort", "Sofortkauf-Tatort", "Night Shopper", "Night Raubzug", "Night Swiper",
"Wer wird Premiumnär", "Wer wird Kriegskassär", "Wer wird Shoppionär", "Shopping Queen", "Kriegskasse Queen",
"DSDS: Der Superkäufer", "Bauer sucht Booster", "Bauer sucht Visa", "Kaufstraße", "Boosterstraße",
"Premiumstraße", "Lindenshop", "Der Shopdoktor", "Alarm für Visa 11", "SOKO Shopping", "Aktenzeichen PP"]}]},

{kat: "Songtitel", gruppen: [
{g: "Rock und Pop international", n: [
"Bohemian Shopsody", "Bohemian Boostsody", "We Will Shop You", "We Will Boost You",
"Another One Buys the Dust", "Another One Boosts", "Highway to Shop", "Highway to Booster",
"Smells Like Premium Spirit", "Smells Like Booster Spirit", "Dreams Are Made of Visa", "Like a Payer",
"Like a Booster", "Shopping in the Deep", "Boosting in the Deep", "Rolling in the Premium",
"Shop Me Baby One More Time", "Boost Me Baby One More", "Stairway to Shopping", "Stairway to Booster",
"Hotel Kaufifornia", "Hotel Kriegskasse", "Thunderkauft", "Thunderbooster", "Born to Shop", "Born to Boost",
"Boost in the USA", "Sweet Child o' Visa", "Sweet Child o' Paket", "Livin' on a Kauf", "Livin' on a Raubzug",
"Nothing Else Shoppers", "Nothing Else Boosters", "Let It Buy", "Let It Pay", "Let It Boost", "I Will Pay",
"I Will Boost", "Don't Stop Shoppin'", "Don't Stop Boostin'", "We Are the Shoppers", "We Are the Booster",
"Kauf It", "Boost It", "Billie Kauf", "Purple Kauf", "Paycemaker", "Premium for Nothing",
"Sympathy for the Shopper", "Shop Me Up Before You Go", "Dancing in the Shop", "Raubzug Rhapsody",
"Raubzug Tonight", "Paket in the Rain", "Paket of Gold", "Kriegskasse Blues", "Hey Kauf", "Yesterpay",
"Shopterloo", "Mastercarena", "Kaufnam Style", "Shape of Shop", "Wind of Kauf", "Smoke on the Visa"]},
{g: "Deutsch und Schlager", n: [
"Premium, Premium, Premium", "Kaufrausch durch die Nacht", "Kaufrausch im Kopf", "Atemlos durch den Shop",
"99 Premiumpunkte", "99 Sofortkäufe", "99 Rohstoffpakete", "Raubzug, Raubzug, Raubzug", "1000 und ein Kauf",
"Marmor, Stein und Premium", "Griechischer Sofortkauf", "Über den Shopwolken", "Ein Bett im Shop",
"Skandal im Premiumshop", "Verdammt, ich kauf dich", "Völlig shoppenlos", "Kaufsterland",
"Niemals in Shop York", "Du hast den Kauf", "I Want It All, Sofortkauf", "Shoppy Birthday"]}]},

{kat: "Städte, Länder und Sehenswürdigkeiten", gruppen: [
{g: "Deutschland", n: [
"Bezahlin", "Kaufburg", "Shoppfurt", "Kauftgart", "Düsselshop", "Shoppertal", "Buylefeld", "Shoponn",
"Kaufzig", "Shoppmund", "Buy-xtehude", "Kaufbeuren", "Kaufschwanstein", "Brandenburger Shoptor", "Kauftag",
"Kaufspitze", "Shoptoberfest", "Kaufwald"]},
{g: "Europa", n: [
"Payris", "Swipien", "Shopsterdam", "Buycelona", "Mastercardrid", "Verschwendig", "Zahlen", "Buydapest",
"Kaufschau", "Shopholm", "Kaufenhagen", "Moneyco", "Monte Cashlo", "Ibuyza", "Zahlermann", "Big Spend",
"Kaufelturm", "Kaufosseum", "Shoppehenge", "Shopürich"]},
{g: "Rest der Welt", n: [
"Moskauf", "Istanbuy", "Dubuy", "Shoppingapur", "Buykyo", "Shopkong", "Buydney", "Shopp York", "Buyston",
"Chicashgo", "Cash Vegas", "Buyami", "Shoponto", "Rio de Shoppeiro", "Kaufstadt", "Shopllywood",
"Silicon Buyley", "Buyneyland", "Grand Cashyon", "Mount Everspend", "Die Große Kaufmauer", "Taj Bezahlal",
"Pyramiden von Buyzeh", "Zahlediven", "Kauflantis", "Premium Square"]}]},

{kat: "Fußball, Autos und Motorsport", gruppen: [
{g: "Vereine und Stadien", n: [
"Bayern Kaufchen", "FC Shoppern", "Buyern München", "Borussia Shoppmund", "Shopke 04", "Shoppenheim",
"RB Kaufzig", "Eintracht Shopfurt", "Werder Kaufmen", "Hamburger Shop", "1. FC Kaufn", "Shopstadt 98",
"Buyer Leverkusen", "Real Kaufdrid", "FC Buycelona", "Manchester Buyted", "Shopsenal", "Paris Saint-Kauf",
"Juventus Premium", "Die Shopliga", "Champions Kauf", "Premium League", "Die Kaufarena",
"Signal Iduna Shop"]},
{g: "Autos und Rennsport", n: [
"Shopsche 911", "Buyrrari", "Lamborshoppini", "Mercedes-Kauf", "Shopvrolet", "Volksshoppen", "Kaufkswagen",
"Buygatti", "Rolls-Shopce", "Aston Shoppin", "Formel Kauf", "Boxenstopp Premium", "Shoppole Position",
"Der Kaufring", "Shopburgring", "24h von Le Kauf", "Monaco Premium", "Der Kaufprix", "Kaufmobil"]}]},

{kat: "Marken und Werbung", gruppen: [{g: "", n: [
"Ich liebe es zu kaufen", "Geiz ist ungeil", "Haben oder Haben", "Yes, we kauf", "Nichts ist unmöglich",
"Quadratisch, teuer, gut", "Mein Haus, mein Premium", "Saturkauf", "Media Shoppt", "Amashop Prime",
"Zalanshop", "Schrei vor Kauflust", "Otto Premium", "Shoppi Markt", "Red Buy", "Red Buy verleiht PP",
"Nike: Just Buy It", "Just Shop It", "Adibuy", "Shopple", "Think Buyferent", "Shopsung", "Kaufbucks",
"Shopdonalds", "Buyger King", "Premium Cola"]}]},

{kat: "Internet, Memes und Technik", gruppen: [{g: "", n: [
"Shut up and take my PP", "Such Premium, very PP", "Doge Premium", "Shopchungus", "One Does Not Simply Buy",
"Rickshopped", "Never Gonna Buy You Up", "Stonks, nur Premium", "To the Shop!", "Deine Mudda shoppt",
"Error 404: PP leer", "Blue Screen of Kauf", "Strg+C, Strg+Kauf", "Alt+F4 Premium", "Shopdate verfügbar",
"Premium Cookies", "Akzeptiere alle Kaufs", "CAPTCHA: Kauf PP", "Shopbot 3000", "KI kauft alles",
"Shoppify", "Kauf-GPT", "Wikishoppedia", "YouShop", "Instashop", "TikShop", "Shopbook"]}]},

{kat: "Essen und Trinken", gruppen: [{g: "", n: [
"Shoppizza", "Pizza Premium", "Döner mit Premium", "Currykauf", "Shopwurst", "Bratshop",
"Schnitzel Premium", "Kaufsalat", "Shopghetti", "Spaghetti Kaufbonara", "Shopsushi", "Kauframen",
"Burger Premium", "Pommes Premium", "Kaufkuchen", "Shopwaffel", "Premium-Eis", "Shopkolade",
"Bier und Premium", "Shoppkorn", "Jägerkauf", "Kaffee Premium", "Shoppuccino", "Latte Macshoppato",
"Käsekauf", "Kaufbrezel"]}]},

{kat: "Brett- und Kartenspiele", gruppen: [{g: "", n: [
"Monopoly Premium", "Schlossallee Kauf", "Mensch, kauf dich", "Siedler von Kaufan", "Risiko Premium",
"Shopoly", "Carcashonne", "Kniffelkauf", "Schach Premium", "Shopmatt", "Buyomino", "Uno, kauf zwei",
"Magic: The Shopping", "Pokémon-Kaufkarten", "Kartenhaus Premium"]}]},

{kat: "Sprüche und Redewendungen", gruppen: [{g: "", n: [
"Geld kauft Siege", "Wer kauft, gewinnt", "Kaufen statt klagen", "Erst kaufen, dann reden",
"Premium kennt kein Limit", "Der Shop ist offen", "Zeit ist Premium", "Premium ist Macht",
"Wer zahlt, befiehlt", "Kaufen bis der Arzt kommt", "Shoppen statt schlafen", "Morgenstund hat PP",
"Der Kauf hat begonnen", "Alle Wege führen zum Shop", "Veni, vidi, kaufi", "Kaufen oder untergehen",
"Lieber reich gekauft", "Geiz frisst Dörfer", "Dein Dorf, mein Premium", "Shoppen ist Silber"]}]}
];
if (typeof module !== "undefined" && module.exports) module.exports = DATEN;
else root.NAMEN_DATEN = DATEN;
})(typeof window !== "undefined" ? window : globalThis);
