const fs = require('fs')
const http = require('http')
const fileExists = require('file-exists')
const decompress = require('decompress');
const rimraf = require('rimraf')
const xml2js = require('xml2js')
const pkg = require('./package.json')

function downloadwiidb() {
	return new Promise((resolve, reject) => {
		if (fileExists.sync('wiitdb.zip')) {
			console.log('skip download')
			return resolve()
		}

		var file = fs.createWriteStream("wiitdb.zip");
		var request = http.get("http://www.gametdb.com/wiitdb.zip", function(response) {
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

async function extractwiidb() {
	rimraf.sync('dist')
	await decompress('wiitdb.zip', 'dist')
}

function readWiiDB() {
	return new Promise((resolve, reject) => {
		fs.readFile('dist/wiitdb.xml', (err, data) => {
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

function gameToEntry(game) {
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
	output.type = game.type ? game.type[0] : 'Wii'
	if (output.type != 'GameCube') {
		output.type = 'Wii'
	}
	return output.serial ? output : null
}

function header(name = 'Wii') {
	return `clrmamepro (
	name "Nintendo - Nintendo ${name}"
	description "Nintendo - Nintendo ${name}"
	version "${pkg.version}"
	homepage "${pkg.homepage}"
)\n`
}

function datEntry(game) {
	gameEntries = ''
	if (game.developer) {
		gameEntries += `\n	developer "${game.developer}"`
	}
	if (game.publisher) {
		gameEntries += `\n	publisher "${game.publisher}"`
	}
	if (game.releaseyear) {
		gameEntries += `\n	releaseyear ${game.releaseyear}`
	}
	if (game.releasemonth) {
		gameEntries += `\n	releasemonth ${game.releasemonth}`
	}
	if (game.releaseday) {
		gameEntries += `\n	releaseday ${game.releaseday}`
	}
	if (game.users) {
		gameEntries += `\n	users ${game.users}`
	}
	if (game.esrb_rating) {
		gameEntries += `\n	esrb_rating "${game.esrb_rating}"`
	}
	return `
game (
	name "${game.name}"
	serial "${game.serial}"${gameEntries}
	rom (
		serial "${game.serial}"
	)
)
`
}

function getDatabase(games, type = 'Wii') {
	database = []

	for (id in games) {
		game = gameToEntry(games[id])
		if (game && game.type == type) {
			database.push(game)
		}
	}

	return database
}

function getDat(database, name) {
	output = header(name)
	for (id in database) {
		output += datEntry(database[id])
	}
	return output
}

async function engage() {
	try {
		console.log('start')
		await downloadwiidb()
		await extractwiidb()
		let games = await readWiiDB()

		let types = ['Wii', 'GameCube'];
		for (let index = 0; index < types.length; ++index) {
		    let type = types[index];

			let database = getDatabase(games, type)

			let dat = getDat(database, type)
			fs.writeFileSync('libretro-database/dat/Nintendo - ' + type + '.dat', dat)
		}
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