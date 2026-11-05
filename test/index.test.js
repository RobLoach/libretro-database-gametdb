const { test } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const { cleanLanguages, cleanTitle, gameToEntry, getDat, getDatabase, readDB } = require('..')

const fixture = path.join(__dirname, 'fixtures', 'wiitdb.xml')

test('cleanLanguages only changes language codes', () => {
	assert.strictEqual(cleanLanguages('DEAD SPACE (Europe) (EN,DE)'), 'DEAD SPACE (Europe) (En,De)')
	assert.strictEqual(cleanLanguages('ENDLESS OCEAN (USA) (EN)'), 'ENDLESS OCEAN (USA) (En)')
	assert.strictEqual(cleanLanguages('Game (USA) (EN,ZHCN)'), 'Game (USA) (En,ZHCN)')
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

	const deadSpace = gameToEntry(games[1])
	assert.strictEqual(deadSpace.genre, 'Shooter')
	assert.strictEqual(deadSpace.pegi_rating, '18')
	assert.strictEqual(deadSpace.esrb_rating, undefined)
	assert.strictEqual(deadSpace.analog, 1)

	assert.strictEqual(gameToEntry(games[3]).cero_rating, 'C')

	assert.strictEqual(gameToEntry(games[1]).name, 'DEAD SPACE (Europe) (En,De)')
	assert.strictEqual(gameToEntry(games[2]).name, 'Pokémon Colosseum (Korea)')
	assert.strictEqual(gameToEntry(games[2]).type, 'GameCube')
	assert.strictEqual(gameToEntry(games[4]), null)
})

test('getDatabase skips games without an ID', async () => {
	const games = await readDB(fixture)
	assert.deepStrictEqual(getDatabase(games).map(game => game.serial), ['007E01', 'RDSP69', 'GC6K01', 'ROWJ08'])
	assert.deepStrictEqual(getDatabase(games, 'Wii').map(game => game.serial), ['007E01', 'RDSP69', 'ROWJ08'])
	assert.deepStrictEqual(getDatabase(games, 'GameCube').map(game => game.serial), ['GC6K01'])
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
	genre "Role-playing (RPG)"
	analog 1
	rom (
		name "Pokemon Colosseum (Korea).iso"
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
	assert.match(dat, /pegi_rating "18"\n	region "Europe"\n	genre "Shooter"\n	analog 1\n/)
	assert.match(dat, /cero_rating "C"\n	region "Japan"\n/)
})
