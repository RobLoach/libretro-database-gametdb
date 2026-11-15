# libretro-database-gametdb

Generates DAT files from [GameTDB](https://www.gametdb.com) for [libretro-database](https://github.com/libretro/libretro-database)'s entries:

- `Nintendo - GameCube.dat`
- `Nintendo - Nintendo 3DS.dat`
- `Nintendo - Nintendo DS.dat`
- `Nintendo - Nintendo Switch.dat`
- `Nintendo - Wii.dat`
- `Nintendo - Wii U.dat`
- `Sony - PlayStation 3.dat`

## Usage

1. Install [Node.js](https://nodejs.org) 18 or newer
2. Run `git submodule update --init`
3. Run `npm i`
4. Run `npm start` to download the latest GameTDB data and write the DATs to `libretro-database/dat/`
    - Use `npm start -- --cached` to reuse previously downloaded `.zip` files
5. Review the changes with `git -C libretro-database diff`, then submit them to [libretro-database](https://github.com/libretro/libretro-database) as a Pull Request

## Development

Run the tests with `npm test`.
