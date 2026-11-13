const fs = require('fs')
const decompress = require('decompress')
const xml2js = require('xml2js')
const pkg = require('./package.json')

const regionNames = {
	'NTSC-U': 'USA',
	'NTSC-J': 'Japan',
	'NTSC-K': 'Korea',
	'NTSC-T': 'Taiwan',
	'NTSC-A': 'Asia',
	'PAL': 'Europe',
	'PAL-R': 'Russia'
}

// GameTDB genres mapped to the genre names used across libretro-database.
const genreNames = {
	'action': 'Action',
	'adventure': 'Adventure',
	'platformer': 'Platform',
	'3d platformer': 'Platform',
	'shooter': 'Shooter',
	'first-person shooter': 'Shooter',
	'third-person shooter': 'Shooter',
	"shoot 'em up": "Shoot'em Up",
	"beat 'em up": "Beat'em Up",
	'fighting': 'Fighting',
	'racing': 'Racing',
	'kart racing': 'Racing',
	'sports': 'Sports',
	'basketball': 'Sports',
	'role-playing': 'Role-playing (RPG)',
	'puzzle': 'Puzzle',
	'simulation': 'Simulation',
	'strategy': 'Strategy',
	'real-time strategy': 'Strategy',
	'music': 'Music',
	'dance': 'Music',
	'karaoke': 'Music',
	'party': 'Mini Games',
	'board game': 'Board',
	'chess': 'Board',
	'cards': 'Card',
	'poker': 'Card',
	'trivia': 'Quiz',
	'pinball': 'Pinball',
	'educational': 'Educational',
	'compilation': 'Compilation',
	'survival horror': 'Survival Horror',
	'interactive fiction': 'Adventure / Interactive Fiction'
}

// Controllers with an analog stick.
const analogControls = ['nunchuk', 'gamecube', 'classiccontroller', 'procontroller', 'pad']

const ratingTypes = ['ESRB', 'PEGI', 'CERO']

// GameTDB language codes mapped to their names.
const languageNames = {
	EN: 'English',
	JA: 'Japanese',
	FR: 'French',
	ES: 'Spanish',
	DE: 'German',
	IT: 'Italian',
	NL: 'Dutch',
	PT: 'Portuguese',
	SE: 'Swedish',
	DK: 'Danish',
	NO: 'Norwegian',
	FI: 'Finnish',
	RU: 'Russian',
	PL: 'Polish',
	CZ: 'Czech',
	SK: 'Slovak',
	HU: 'Hungarian',
	GR: 'Greek',
	TR: 'Turkish',
	AR: 'Arabic',
	KO: 'Korean',
	ZHTW: 'Chinese (Traditional)',
	ZHCN: 'Chinese (Simplified)'
}

const languageCodes = ['EN', 'FR', 'IT', 'ES', 'DE', 'NL', 'PT', 'JA', 'SV', 'FI', 'PL', 'CS', 'HU']

// The optional DAT fields, in the order they are written, and whether they are quoted.
const datFields = [
	['developer', true],
	['publisher', true],
	['releaseyear', false],
	['releasemonth', false],
	['releaseday', false],
	['users', false],
	['esrb_rating', true],
	['pegi_rating', true],
	['cero_rating', true],
	['region', true],
	['language', true],
	['genre', true],
	['analog', false]
]

// The optional ROM fields, in the order they are written.
const romFields = ['size', 'crc', 'md5', 'sha1']

/**
 * Download the given URL to the given file.
 */
async function downloadDB(url, filename, useCache = false) {
	if (useCache && fs.existsSync(filename)) {
		console.log(`Using cached ${filename}`)
		return
	}
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
	}
	await fs.promises.writeFile(filename, Buffer.from(await response.arrayBuffer()))
}

async function readDB(filename) {
	const result = await xml2js.parseStringPromise(await fs.promises.readFile(filename, 'utf8'))
	const games = result?.datafile?.game
	if (!games) {
		throw new Error(`No games found in ${filename}`)
	}
	return games
}

/**
 * Title-case the language codes in a GameTDB name, like "(EN,FR)" to "(En,Fr)".
 */
function cleanLanguages(name) {
	return name.replace(/\(([A-Z]{2,4}(?:,[A-Z]{2,4})*)\)/g, (match, codes) => {
		return '(' + codes.split(',').map(code => {
			return languageCodes.includes(code) ? code[0] + code.slice(1).toLowerCase() : code
		}).join(',') + ')'
	})
}

function gameToEntry(game) {
	const serial = game.id?.[0]
	if (!serial) {
		return null
	}

	const date = game.date?.[0]?.$
	const entry = {
		name: cleanLanguages(game.$?.name ?? '').replaceAll('°', ''),
		serial,
		developer: game.developer?.[0],
		publisher: game.publisher?.[0],
		releaseyear: date?.year,
		releasemonth: date?.month,
		releaseday: date?.day,
		region: regionNames[game.region?.[0] ?? 'NTSC-U'],
		type: game.type?.[0] == 'GameCube' ? 'GameCube' : 'Wii'
	}

	// Prefer the English title, with the region
	const english = game.locale?.findLast(locale => locale.$.lang == 'EN' && locale.title?.[0])
	if (english) {
		entry.name = english.title[0] + (entry.region ? ` (${entry.region})` : '')
	}

	// Languages, like "EN,FR" to "English / French"
	const languages = typeof game.languages?.[0] == 'string' ? game.languages[0].split(',') : []
	entry.language = languages.map(code => code.trim()).filter(Boolean)
		.map(code => languageNames[code] ?? code).join(' / ') || undefined

	// ROM size and hashes of each dump, skipping duplicate dumps
	entry.roms = []
	for (const rom of game.rom ?? []) {
		const crc = rom.$?.crc?.toUpperCase()
		if (crc && !entry.roms.some(other => other.crc == crc)) {
			entry.roms.push({
				version: rom.$.version,
				size: rom.$.size,
				crc,
				md5: rom.$.md5?.toUpperCase(),
				sha1: rom.$.sha1?.toUpperCase()
			})
		}
	}

	// Amount of players/users, and analog support
	const input = game.input?.[0]
	if (input?.$?.players > 0) {
		entry.users = input.$.players
	}
	if (input?.control?.some(control => analogControls.includes(control.$.type))) {
		entry.analog = 1
	}

	// Genre, using the most specific one GameTDB lists, like "action,platformer" to "Platform"
	const genres = typeof game.genre?.[0] == 'string' ? game.genre[0].split(',') : []
	entry.genre = genres.map(genre => genreNames[genre.trim()]).filter(Boolean).pop()

	// Age Rating
	const rating = game.rating?.[0]?.$
	if (rating?.value && ratingTypes.includes(rating.type)) {
		entry[rating.type.toLowerCase() + '_rating'] = rating.value
	}

	return entry
}

/**
 * The DAT version, which is the date it was generated.
 */
function today() {
	return new Date().toISOString().slice(0, 10).replaceAll('-', '.')
}

function header(title, extensions, version = today()) {
	return `clrmamepro (
	name "${title}"
	description "${title}"
	version "${version}"
	extensions "${extensions.join('|')}"
	homepage "${pkg.homepage}"
)\n`
}

/**
 * Clean the given value to be DAT file safe.
 */
function cleanValue(val) {
	return String(val).replaceAll('"', '\'')
}

/**
 * Strip accents from Latin characters, like "é" to "e".
 */
function cleanTitle(val) {
	return val
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.normalize('NFC')
}

/**
 * Construct a DAT entry based on the given game.
 */
function datEntry(game, extension) {
	let gameEntries = ''
	for (const [key, quoted] of datFields) {
		if (game[key]) {
			const value = cleanValue(game[key])
			gameEntries += `\n	${key} ${quoted ? `"${value}"` : value}`
		}
	}

	let romEntries = ''
	for (const key of romFields) {
		if (game[key]) {
			romEntries += `\n		${key} ${cleanValue(game[key])}`
		}
	}

	const gameName = cleanTitle(cleanValue(game.name))
	return `
game (
	name "${gameName}"
	serial "${cleanValue(game.serial)}"${gameEntries}
	rom (
		name "${gameName}.${extension}"${romEntries}
		serial "${cleanValue(game.serial)}"
	)
)
`
}

function compare(a, b) {
	return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Split a game into one entry per dump, naming the revisions like "Game (USA) (Rev 1)".
 */
function splitRoms({ roms, ...game }) {
	if (roms.length <= 1) {
		return [{ ...game, ...roms[0] }]
	}
	return roms.map(rom => {
		const revision = rom.version && rom.version != '0' ? ` (Rev ${rom.version})` : ''
		return { ...game, ...rom, name: game.name + revision }
	})
}

function getDatabase(games, type = null) {
	return games
		.map(gameToEntry)
		.filter(game => game && (type == null || game.type == type))
		.flatMap(splitRoms)
		.sort((a, b) => compare(a.name, b.name) || compare(a.serial, b.serial) || compare(a.crc, b.crc))
}

function getDat(database, title, extension, version) {
	return header(title, [extension], version) +
		database.map(game => datEntry(game, extension)).join('')
}

async function buildDat(source, outputs, useCache) {
	await downloadDB(`https://www.gametdb.com/${source}.zip`, `${source}.zip`, useCache)
	await decompress(`${source}.zip`, 'dist')
	const games = await readDB(`dist/${source}.xml`)
	for (const { type, title, extension, file } of outputs) {
		const database = getDatabase(games, type)
		fs.writeFileSync(`libretro-database/dat/${file}.dat`, getDat(database, title, extension))
	}
}

async function main(args = process.argv.slice(2)) {
	if (!fs.existsSync('libretro-database/dat')) {
		throw new Error('libretro-database/dat not found. Run `git submodule update --init`.')
	}
	const useCache = args.includes('--cached')

	console.log('Wii/GameCube')
	await buildDat('wiitdb', [
		{ type: 'Wii', title: 'Nintendo - Nintendo Wii', extension: 'iso', file: 'Nintendo - Wii' },
		{ type: 'GameCube', title: 'Nintendo - Nintendo GameCube', extension: 'iso', file: 'Nintendo - GameCube' }
	], useCache)

	console.log('Sony PlayStation 3')
	await buildDat('ps3tdb', [
		{ title: 'Sony - PlayStation 3', extension: 'iso', file: 'Sony - PlayStation 3' }
	], useCache)

	console.log('Nintendo Wii U')
	await buildDat('wiiutdb', [
		{ title: 'Nintendo - Nintendo Wii U', extension: 'wux', file: 'Nintendo - Wii U' }
	], useCache)

	// TODO: Nintendo Switch (switchtdb), once there is a Switch libretro core.
	// TODO: Nintendo DS (dstdb), if RetroArch adds serial scanning for it.
	// Nintendo 3DS (3dstdb) is skipped, as GameTDB doesn't provide the CRCs RetroArch scans with.
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e)
		process.exitCode = 1
	})
}

module.exports = {
	cleanLanguages,
	cleanTitle,
	cleanValue,
	datEntry,
	downloadDB,
	gameToEntry,
	getDat,
	getDatabase,
	header,
	readDB
}
