// eslint-disable-next-line node/no-unpublished-require
require('dotenv').config();
import { ShardingManager } from 'discord.js';

let totalShards: number | "auto" | undefined = 'auto';

if (process.env.shards) {
    totalShards = parseInt(process.env.shards);
}

const manager = new ShardingManager(__dirname + '/bot.js', {
    totalShards: totalShards,
    token: process.env.token,
});

manager.on('shardCreate', shard => {
    console.log(`Launched shard ${shard.id}`);
});

process.on('unhandledRejection', e => console.error(e));
process.on('uncaughtException', e => console.error(e));

manager.spawn({ timeout: -1 });
