const fs = require('fs')
const https = require('https')
const decompress = require('decompress')
const xml2js = require('xml2js')
const arraySort = require('array-sort')
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

const languageCodes = ['EN', 'FR', 'IT', 'ES', 'DE', 'NL', 'PT', 'JA', 'SV', 'FI', 'PL', 'CS', 'HU']

/**
 * Download the given URL to the given file, following redirects.
 */
function downloadDB(url, filename, useCache = false, redirects = 5) {
	if (useCache && fs.existsSync(filename)) {
		console.log(`Using cached ${filename}`)
		return Promise.resolve()
	}

	return new Promise((resolve, reject) => {
		https.get(url, (response) => {
			const { statusCode, headers } = response
			if (statusCode >= 300 && statusCode < 400 && headers.location && redirects > 0) {
				response.resume()
				const location = new URL(headers.location, url).toString()
				return downloadDB(location, filename, false, redirects - 1).then(resolve, reject)
			}
			if (statusCode !== 200) {
				response.resume()
				return reject(new Error(`Failed to download ${url}: HTTP ${statusCode}`))
			}

			const partial = filename + '.part'
			const file = fs.createWriteStream(partial)
			response.on('error', reject)
			file.on('error', reject)
			file.on('finish', () => {
				fs.renameSync(partial, filename)
				resolve()
			})
			response.pipe(file)
		}).on('error', reject)
	})
}

async function extractDB(filename) {
	await decompress(filename, 'dist')
}

function readDB(filename = 'dist/wiitdb.xml') {
	return new Promise((resolve, reject) => {
		fs.readFile(filename, (err, data) => {
			if (err) {
				return reject(err)
			}
			xml2js.parseString(data.toString(), (err, result) => {
				if (err) {
					return reject(err)
				}
				if (!result || !result.datafile || !result.datafile.game) {
					return reject(new Error(`No games found in ${filename}`))
				}
				resolve(result.datafile.game)
			})
		})
	})
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

function gameToEntry(game, type) {
	const serial = game.id ? game.id[0] : ''
	if (!serial) {
		return null
	}

	const output = {}
	output.name = cleanLanguages(game['$'] ? game['$'].name : '').replaceAll('°', '')

	output.region = game.region ? game.region[0] : 'NTSC-U'
	output.regionName = regionNames[output.region]

	for (const locale of game.locale || []) {
		if (locale.$.lang == 'EN' && locale.title && locale.title[0]) {
			output.name = locale.title[0]
			if (output.regionName) {
				output.name += ' (' + output.regionName + ')'
			}
		}
	}

	// Clean up Japanese titles
	if (output.name == " (Japan) (Ja)" || output.name == " (Korea) (KO)") {
		for (const locale of game.locale || []) {
			if (locale.$.lang == 'JA' || locale.$.lang == 'KO') {
				output.name = locale.title[0]
			}
		}
	}

	// Amount of players/users
	if (game.input) {
		const input = game.input
		if (input[0] && input[0]['$'] && input[0]['$'].players) {
			output.users = input[0]['$'].players
		}
	}

	// Genre, using the most specific one GameTDB lists, like "action,platformer" to "Platform"
	if (game.genre && typeof game.genre[0] == 'string') {
		for (const genre of game.genre[0].split(',')) {
			output.genre = genreNames[genre.trim()] || output.genre
		}
	}

	// Analog support
	const input = game.input && game.input[0]
	if (input && input.control && input.control.some(control => analogControls.includes(control.$.type))) {
		output.analog = 1
	}

	// Age Ratings
	if (game.rating && game.rating[0].$ && game.rating[0].$.value) {
		const rating = game.rating[0].$
		switch (rating.type) {
			case 'ESRB':
				output.esrb_rating = rating.value
				break
			case 'PEGI':
				output.pegi_rating = rating.value
				break
			case 'CERO':
				output.cero_rating = rating.value
				break
		}
	}

	output.serial = serial

	// Developer
	output.developer = game.developer ? game.developer[0] : ''
	if (game.date && game.date[0] && game.date[0].$) {
		output.releaseyear = game.date[0].$.year
		output.releasemonth = game.date[0].$.month
		output.releaseday = game.date[0].$.day
	}
	output.publisher = game.publisher ? game.publisher[0] : ''

	if (type == 'Wii' || type == 'GameCube') {
		output.type = game.type ? game.type[0] : 'Wii'
		if (output.type != 'GameCube') {
			output.type = 'Wii'
		}
	}

	return output
}

/**
 * The DAT version, which is the date it was generated.
 */
function today() {
	return new Date().toISOString().slice(0, 10).replaceAll('-', '.')
}

function header(name, vendor, consoleParent, extensions, version = today()) {
	return `clrmamepro (
	name "${vendor} - ${consoleParent} ${name}"
	description "${vendor} - ${consoleParent} ${name}"
	version "${version}"
	extensions "${extensions.join('|')}"
	homepage "${pkg.homepage}"
)\n`
}

/**
 * Clean the given value to be DAT file safe.
 */
function cleanValue(val) {
	return val.replace(new RegExp('"', 'g'), '\'')
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
	if (game.developer) {
		gameEntries += `\n	developer "${cleanValue(game.developer)}"`
	}
	if (game.publisher) {
		gameEntries += `\n	publisher "${cleanValue(game.publisher)}"`
	}
	if (game.releaseyear) {
		gameEntries += `\n	releaseyear ${cleanValue(game.releaseyear)}`
	}
	if (game.releasemonth) {
		gameEntries += `\n	releasemonth ${cleanValue(game.releasemonth)}`
	}
	if (game.releaseday) {
		gameEntries += `\n	releaseday ${cleanValue(game.releaseday)}`
	}
	if (game.users > 0) {
		gameEntries += `\n	users ${cleanValue(game.users)}`
	}
	if (game.esrb_rating) {
		gameEntries += `\n	esrb_rating "${cleanValue(game.esrb_rating)}"`
	}
	if (game.pegi_rating) {
		gameEntries += `\n	pegi_rating "${cleanValue(game.pegi_rating)}"`
	}
	if (game.cero_rating) {
		gameEntries += `\n	cero_rating "${cleanValue(game.cero_rating)}"`
	}
	if (game.regionName) {
		gameEntries += `\n	region "${cleanValue(game.regionName)}"`
	}
	if (game.genre) {
		gameEntries += `\n	genre "${cleanValue(game.genre)}"`
	}
	if (game.analog) {
		gameEntries += `\n	analog 1`
	}

	const gameName = cleanTitle(cleanValue(game.name))
	return `
game (
	name "${gameName}"
	serial "${cleanValue(game.serial)}"${gameEntries}
	rom (
		name "${gameName}.${extension}"
		serial "${cleanValue(game.serial)}"
	)
)
`
}

function getDatabase(games, type = null) {
	const database = games
		.map(game => gameToEntry(game, type))
		.filter(game => game && (type == null || game.type == type))
	return arraySort(database, ['name', 'serial'])
}

function getDat(database, name, vendor, consoleParent, extension, version) {
	return header(name, vendor, consoleParent, [extension], version) +
		database.map(game => datEntry(game, extension)).join('')
}

async function buildDat(source, outputs, useCache) {
	await downloadDB(`https://www.gametdb.com/${source}.zip`, `${source}.zip`, useCache)
	await extractDB(`${source}.zip`)
	const games = await readDB(`dist/${source}.xml`)
	for (const { type, name, vendor, consoleParent, extension, file } of outputs) {
		const database = getDatabase(games, type)
		fs.writeFileSync(`libretro-database/dat/${file}.dat`, getDat(database, name, vendor, consoleParent, extension))
	}
}

async function main(args = process.argv.slice(2)) {
	if (!fs.existsSync('libretro-database/dat')) {
		throw new Error('libretro-database/dat not found. Run `git submodule update --init`.')
	}
	const useCache = args.includes('--cached')

	console.log('Wii/GameCube')
	await buildDat('wiitdb', [
		{ type: 'Wii', name: 'Wii', vendor: 'Nintendo', consoleParent: 'Nintendo', extension: 'iso', file: 'Nintendo - Wii' },
		{ type: 'GameCube', name: 'GameCube', vendor: 'Nintendo', consoleParent: 'Nintendo', extension: 'iso', file: 'Nintendo - GameCube' }
	], useCache)

	console.log('Sony PlayStation 3')
	await buildDat('ps3tdb', [
		{ name: '3', vendor: 'Sony', consoleParent: 'PlayStation', extension: 'iso', file: 'Sony - PlayStation 3' }
	], useCache)

	console.log('Nintendo Wii U')
	await buildDat('wiiutdb', [
		{ name: 'Wii U', vendor: 'Nintendo', consoleParent: 'Nintendo', extension: 'wux', file: 'Nintendo - Wii U' }
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
