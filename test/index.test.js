const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { cleanCompanies, cleanDescription, cleanLanguages, cleanTitle, gameToEntry, getDat, getDatabase, readDB } = require('..')

const fixture = path.join(__dirname, 'fixtures', 'wiitdb.xml')

test('cleanLanguages only changes language codes', () => {
	assert.strictEqual(cleanLanguages('DEAD SPACE (Europe) (EN,DE)'), 'DEAD SPACE (Europe) (En,De)')
	assert.strictEqual(cleanLanguages('ENDLESS OCEAN (USA) (EN)'), 'ENDLESS OCEAN (USA) (En)')
	assert.strictEqual(cleanLanguages('Game (USA) (EN,ZHCN)'), 'Game (USA) (En,ZHCN)')
})

test('cleanCompanies separates companies with slashes', () => {
	assert.strictEqual(cleanCompanies('Namco, tri-Crescendo'), 'Namco / tri-Crescendo')
	assert.strictEqual(cleanCompanies('Beenox/Vicarious Visions'), 'Beenox / Vicarious Visions')
	assert.strictEqual(cleanCompanies('Take 2 Interactive / 2K Sports'), 'Take 2 Interactive / 2K Sports')
	assert.strictEqual(cleanCompanies('Bean/TFG/JJ, Bean'), 'Bean / TFG / JJ')
	assert.strictEqual(cleanCompanies('Nintendo'), 'Nintendo')
	assert.strictEqual(cleanCompanies('N/A'), undefined)
	assert.strictEqual(cleanCompanies(''), undefined)
	assert.strictEqual(cleanCompanies(undefined), undefined)
})

test('cleanCompanies keeps company suffixes and web addresses', () => {
	assert.strictEqual(cleanCompanies('HUDSON SOFT CO., LTD.'), 'HUDSON SOFT CO., LTD.')
	assert.strictEqual(cleanCompanies('Other Ocean Group, Inc., Nintendo'), 'Other Ocean Group, Inc. / Nintendo')
	assert.strictEqual(cleanCompanies('Coca-Cola (Japan) Company, Limited'), 'Coca-Cola (Japan) Company, Limited')
	assert.strictEqual(cleanCompanies('EnsenaSoft, S.A. de C.V.'), 'EnsenaSoft, S.A. de C.V.')
	assert.strictEqual(cleanCompanies('Activision, LLC/Raven'), 'Activision, LLC / Raven')
	assert.strictEqual(cleanCompanies('38,9_Degrees'), '38,9_Degrees')
	assert.strictEqual(cleanCompanies('Wiimm, wiimm.de/r/mkw/fun'), 'Wiimm / wiimm.de/r/mkw/fun')
})

test('cleanDescription puts it on one line and cuts it off', () => {
	assert.strictEqual(cleanDescription('  Jump\n\n and  run. '), 'Jump and run.')
	assert.strictEqual(cleanDescription(''), undefined)
	assert.strictEqual(cleanDescription(undefined), undefined)
	assert.strictEqual(cleanDescription('a'.repeat(140)), 'a'.repeat(140))
	assert.strictEqual(cleanDescription('a'.repeat(141)), 'a'.repeat(137) + '...')
	const long = cleanDescription('Mario jumps, '.repeat(30))
	assert.strictEqual(long, 'Mario jumps, '.repeat(10) + 'Mario...')
	assert.ok(long.length <= 140)
})

test('cleanTitle strips accents and keeps other scripts', () => {
	assert.strictEqual(cleanTitle('Pokémon Ōkami ōkami Señor Über'), 'Pokemon Okami okami Senor Uber')
	assert.strictEqual(cleanTitle('大神 ポケモン 포켓몬'), '大神 ポケモン 포켓몬')
})

test('readDB parses games', async () => {
	const games = await readDB(fixture)
	assert.strictEqual(games.length, 5)
})

test('gameToEntry maps fields and regions', async () => {
	const games = await readDB(fixture)
	const erase = gameToEntry(games[0])
	assert.strictEqual(erase.name, 'Auto Erase Disc (USA)')
	assert.strictEqual(erase.serial, '007E01')
	assert.strictEqual(erase.esrb_rating, 'E')
	assert.strictEqual(erase.releaseyear, '2007')
	assert.strictEqual(erase.type, 'Wii')
	assert.strictEqual(erase.region, 'USA')
	assert.strictEqual(erase.genre, undefined)
	assert.strictEqual(erase.analog, undefined)
	assert.strictEqual(erase.language, undefined)
	assert.deepStrictEqual(erase.roms, [])

	const deadSpace = gameToEntry(games[1])
	assert.strictEqual(deadSpace.genre, 'Action / Shooter')
	assert.strictEqual(deadSpace.pegi_rating, '18')
	assert.strictEqual(deadSpace.esrb_rating, undefined)
	assert.strictEqual(deadSpace.analog, 1)
	assert.strictEqual(deadSpace.language, 'English / German')
	assert.deepStrictEqual(deadSpace.roms, [])
	assert.strictEqual(deadSpace.controls, 'Wii Remote / Nunchuk / Classic Controller')
	assert.strictEqual(deadSpace.description, undefined)
	assert.strictEqual(erase.controls, 'Wii Remote')
	assert.strictEqual(gameToEntry(games[2], 'Wii U GamePad').controls, 'GameCube Controller')

	assert.strictEqual(gameToEntry(games[3]).cero_rating, 'C')
	assert.strictEqual(gameToEntry(games[3]).genre, 'Action / Platform / Adventure / Interactive Fiction')

	assert.strictEqual(gameToEntry(games[1]).name, 'DEAD SPACE (Europe) (En,De)')
	assert.strictEqual(gameToEntry(games[2]).name, 'Pokémon Colosseum (Korea)')
	assert.strictEqual(gameToEntry(games[2]).type, 'GameCube')
	assert.strictEqual(gameToEntry(games[4]), null)
})

test('getDatabase skips games without an ID', async () => {
	const games = await readDB(fixture)
	assert.deepStrictEqual(getDatabase(games).map(game => game.serial), ['007E01', 'RDSP69', 'GC6K01', 'GC6K01', 'ROWJ08'])
	assert.deepStrictEqual(getDatabase(games, 'Wii').map(game => game.serial), ['007E01', 'RDSP69', 'ROWJ08'])
	assert.deepStrictEqual(getDatabase(games, 'GameCube').map(game => game.serial), ['GC6K01', 'GC6K01'])
})

test('getDatabase writes a game for each dump', async () => {
	const games = await readDB(fixture)
	const roms = getDatabase(games, 'GameCube').map(({ name, crc }) => ({ name, crc }))
	assert.deepStrictEqual(roms, [
		{ name: 'Pokémon Colosseum (Korea)', crc: '1A2B3C4D' },
		{ name: 'Pokémon Colosseum (Korea) (Rev 1)', crc: 'FFFFFFFF' }
	])
})

test('getDat writes the header and entries', async () => {
	const games = await readDB(fixture)
	const dat = getDat(getDatabase(games, 'GameCube'), 'Nintendo - Nintendo GameCube', 'iso', '2026.11.05')
	assert.strictEqual(dat, `clrmamepro (
	name "Nintendo - Nintendo GameCube"
	description "Nintendo - Nintendo GameCube"
	version "2026.11.05"
	extensions "iso"
	homepage "https://github.com/RobLoach/libretro-database-gametdb"
)

game (
	name "Pokemon Colosseum (Korea)"
	serial "GC6K01"
	users 2
	region "Korea"
	language "Korean / XX"
	genre "Role-playing (RPG)"
	analog 1
	controls "GameCube Controller"
	description "Battle with 'Shadow' Pokémon."
	rom (
		name "Pokemon Colosseum (Korea).iso"
		size 1459978240
		crc 1A2B3C4D
		md5 0123456789ABCDEF0123456789ABCDEF
		sha1 0123456789ABCDEF0123456789ABCDEF01234567
		serial "GC6K01"
	)
)

game (
	name "Pokemon Colosseum (Korea) (Rev 1)"
	serial "GC6K01"
	users 2
	region "Korea"
	language "Korean / XX"
	genre "Role-playing (RPG)"
	analog 1
	controls "GameCube Controller"
	description "Battle with 'Shadow' Pokémon."
	rom (
		name "Pokemon Colosseum (Korea) (Rev 1).iso"
		size 1459978240
		crc FFFFFFFF
		serial "GC6K01"
	)
)
`)
})

test('getDat cleans quotes and skips zero users', async () => {
	const games = await readDB(fixture)
	const dat = getDat(getDatabase(games, 'Wii'), 'Nintendo - Nintendo Wii', 'iso')
	assert.match(dat, /version "\d{4}\.\d{2}\.\d{2}"/)
	assert.match(dat, /developer "EA 'Redwood'"/)
	assert.match(dat, /users 1\n/)
	assert.doesNotMatch(dat, /users 0/)
	assert.match(dat, /pegi_rating "18"\n	region "Europe"\n	language "English \/ German"\n	genre "Action \/ Shooter"\n	analog 1\n	controls "Wii Remote \/ Nunchuk \/ Classic Controller"\n/)
	assert.match(dat, /cero_rating "C"\n	region "Japan"\n/)
})

test('readDB parses the 3DS database, which has an element name starting with a digit', async () => {
	const games = await readDB(path.join(__dirname, 'fixtures', '3dstdb.xml'))
	const game = gameToEntry(games[0])
	assert.strictEqual(game.name, 'Metal Gear Solid: Snake Eater 3D (Europe)')
	assert.strictEqual(game.serial, 'AMGP')
	assert.strictEqual(game.region, 'Europe')
	assert.strictEqual(game.pegi_rating, '18')
	assert.strictEqual(game.controls, 'Circle Pad Pro')
	assert.strictEqual(game.analog, 1)
	assert.match(getDat(getDatabase(games), 'Nintendo - Nintendo 3DS', '3ds'), /name "Metal Gear Solid: Snake Eater 3D \(Europe\).3ds"\n		size 1073741824\n		crc 1A2B3C4D\n		serial "AMGP"/)
})

test('gameToEntry reads the DS players', async () => {
	const games = await readDB(path.join(__dirname, 'fixtures', 'dstdb.xml'))
	const game = gameToEntry(games[0])
	assert.strictEqual(game.name, 'WarioWare: Touched! (Demo) (USA)')
	assert.strictEqual(game.users, '2')
	assert.strictEqual(game.controls, 'Rumble Pak')
	assert.strictEqual(game.esrb_rating, 'E')
	assert.strictEqual(game.description, 'Microgames.')
})

test('gameToEntry reads the Switch regions and ratings', async () => {
	const games = await readDB(path.join(__dirname, 'fixtures', 'switchtdb.xml'))
	const joe = gameToEntry(games[1])
	assert.strictEqual(joe.name, 'NEW Joe & Mac - Caveman Ninja (World)')
	assert.strictEqual(joe.region, 'World')
	assert.strictEqual(joe.esrb_rating, 'E10+')
	assert.strictEqual(joe.pegi_rating, '7')
	assert.strictEqual(joe.users, '2')
	assert.strictEqual(joe.analog, 1)
	assert.strictEqual(joe.controls, 'Joy-Con / Pro Controller')
	assert.strictEqual(gameToEntry(games[0]).region, 'USA, Europe')
	assert.deepStrictEqual(getDatabase(games).map(({ name, crc }) => ({ name, crc })), [
		{ name: 'NEW Joe & Mac - Caveman Ninja (World)', crc: undefined },
		{ name: 'Quest Contents Install Tool (USA, Europe) (Rev 1.0.0)', crc: 'C4A2D267' },
		{ name: 'Quest Contents Install Tool (USA, Europe) (Rev 1.0.2)', crc: 'F9D4CB6C' }
	])
})
