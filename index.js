const fs = require('fs')
const http = require('http')
const fileExists = require('file-exists')
const decompress = require('decompress');
const rimraf = require('rimraf')
const xml2js = require('xml2js')
const pkg = require('./package.json')
const arraySort = require('array-sort')

function downloadDB(url, filename) {
	return new Promise((resolve, reject) => {
		if (fileExists.sync(filename)) {
			console.log('skip download')
			return resolve()
		}

		var file = fs.createWriteStream(filename);
		var request = http.get(url, function(response) {
			console.log(response)
			response.pipe(file);
		})
		file.on('finish', () => {
			resolve()
		})
		file.on('error', () => {
			console.log("nooooooo")
			reject()
		})
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
			xml2js.parseString(data, (err, result) => {
				if (err) {
					return reject(err)
				}
				resolve(result.datafile.game)
			})
		})
	})
}

function gameToEntry(game, type) {
	output = {}
	output.name = game['$'] ? game['$'].name : ''
	let nameReplacements = {
		'EN': 'En',
		'FR': 'Fr',
		'IT': 'It',
		'ES': 'Es',
		'DE': 'De',
		'NL': 'Nl',
		'PT': 'Pt',
		'JA': 'Ja',
		'SV': 'Sv',
		'FI': 'Fi',
		'PL': 'Pl',
		'CS': 'Cs',
		'HU': 'Hu'
	}
	for (let original in nameReplacements) {
		output.name = output.name.replace(original, nameReplacements[original])
	}

	output.region = game.region ? game.region[0] : 'NTSC-U'
	switch (output.region) {
		case 'NTSC-U':
			output.regionName = 'USA'
			break;
		case 'NTSC-J':
			output.regionName = 'Japan'
			break;
		case 'PAL':
			output.regionName = 'Europe'
			break
	}

	for (let id in game.locale) {
		if (game.locale[id].$.lang == 'EN' && game.locale[id].title && game.locale[id].title[0]) {
			output.name = game.locale[id].title[0]
			if (output.regionName) {
				output.name += ' (' + output.regionName + ')'
			}
		}
	}

	if (game.input) {
		if (game.input[0]['$'].players) {
			output.users = game.input[0]['$'].players
		}
	}

	if (game.rating) {
		if (game.rating[0]['$'].type == 'ESRB') {
			output.esrb_rating = game.rating[0]['$'].value
		}
	}

	output.serial = game.id ? game.id[0] : ''
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

	return output.serial ? output : null
}

function header(name, vendor, consoleParent) {
	return `clrmamepro (
	name "${vendor} - ${consoleParent} ${name}"
	description "${vendor} - ${consoleParent} ${name}"
	version "${pkg.version}"
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
 * Construct a DAT entry based on the given game.
 */
function datEntry(game) {
	gameEntries = ''
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
	if (game.users) {
		gameEntries += `\n	users ${cleanValue(game.users)}`
	}
	if (game.esrb_rating) {
		gameEntries += `\n	esrb_rating "${cleanValue(game.esrb_rating)}"`
	}
	return `
game (
	name "${cleanValue(game.name)}"
	serial "${game.serial}"${gameEntries}
	rom (
		serial "${cleanValue(game.serial)}"
	)
)
`
}

function getDatabase(games, type = null) {
	database = []

	for (id in games) {
		game = gameToEntry(games[id], type)
		if (type == null || game.type == type) {
			database.push(game)
		}
	}

	database = arraySort(database, ['name', 'serial'])

	return database
}

function getDat(database, name, vendor, consoleParent) {
	output = header(name, vendor, consoleParent)
	for (id in database) {
		output += datEntry(database[id])
	}
	return output
}

async function engage() {
	try {
		console.log('Wii/GameCube')
		await downloadDB('http://www.gametdb.com/wiitdb.zip', 'wiitdb.zip')
		await extractDB('wiitdb.zip')
		let games = await readDB('dist/wiitdb.xml')
		let types = ['Wii', 'GameCube'];
		for (let index = 0; index < types.length; ++index) {
		    let type = types[index];
			let database = getDatabase(games, type)
			let dat = getDat(database, type, 'Nintendo', 'Nintendo')
			fs.writeFileSync('libretro-database/dat/Nintendo - ' + type + '.dat', dat)
		}

		console.log('Sony PlayStation 3')
		await downloadDB('http://www.gametdb.com/ps3tdb.zip', 'ps3tdb.zip')
		await extractDB('ps3tdb.zip')
		games = await readDB('dist/ps3tdb.xml')
		let ps3database = getDatabase(games)
		let ps3dat = getDat(ps3database, '3', 'Sony', 'PlayStation')
		fs.writeFileSync('libretro-database/dat/Sony - PlayStation 3.dat', ps3dat)

		console.log('Nintendo Wii U')
		await downloadDB('http://www.gametdb.com/wiiutdb.zip', 'wiiutdb.zip')
		await extractDB('wiiutdb.zip')
		games = await readDB('dist/wiiutdb.xml')
		let wiiudatabase = getDatabase(games)
		let wiiudat = getDat(wiiudatabase, 'Wii U', 'Nintendo', 'Nintendo')
		fs.writeFileSync('libretro-database/dat/Nintendo - Wii U.dat', wiiudat)

		/*
		TODO: Add serial scanning to Nintendo DS?
		console.log('Nintendo DS')
		await downloadDB('http://www.gametdb.com/dstdb.zip?LANG=EN', 'dstdb.zip')
		await extractDB('dstdb.zip')
		games = await readDB('dist/dstdb.xml')
		let dsdatabase = getDatabase(games)
		let dsdat = getDat(dsdatabase, 'DS', 'Nintendo', 'Nintendo')
		fs.writeFileSync('libretro-database/dat/Nintendo - Nintendo DS.dat', dsdat)	
		*/

		/*
		TODO: Fix XML parser not working with <3DS in the beginning.
		console.log('Nintendo 3DS')
		await downloadDB('http://www.gametdb.com/3dstdb.zip?LANG=EN', '3dstdb.zip')
		await extractDB('3dstdb.zip')
		games = await readDB('dist/3dstdb.xml')
		let threedsdatabase = getDatabase(games)
		let threedsdat = getDat(threedsdatabase, '3DS', 'Nintendo', 'Nintendo')
		fs.writeFileSync('libretro-database/dat/Nintendo - Nintendo 3DS.dat', threedsdat)
		*/
	}
	catch (e) {
		console.error(e)
	}
}


try {
engage()
}
catch (e) {
	console.error(e)
}