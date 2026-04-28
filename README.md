# Run Bot

- run `bun i` to install the dependencies
- run `bun run build` to build the source

- Start the REST Proxy: `bun run start:rest`
- Deploy the commands `bun dist/bot/registerCommands.js`
- Start the Bot: `bun run start:bot`
- Start Gateway: `bun run start:gateway`

## Commands

### Public Commands

`/about` - Public
`/badservers` - Public
`/checkserver` - Public
`/checkuser` - Public
`/invite` - Public
`/ping` - Public
`/checkself` - Public
`/status` - Public

### Staff Commands

`/adduser` - Staff
`/appeal` - Staff
`/bsm` - Staff
`/checkserveradmin` - Staff
`/checkuseradmin` - Staff
`/forcecheck` - Staff
`/multiadduser` - Staff
`/multicheckuseradmin` - Staff
`/multiforcecheck` - Staff
`/note` - Staff
`/updateservername` - Staff
`/upstatus` - Staff

### Admin Commands
