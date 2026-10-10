import * as Mindcraft from '../mindcraft/mindcraft.js';
import settings from '../../settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('mindserver_port', {
            type: 'number',
            describe: 'Mindserver port',
            default: settings.mindserver_port
        })
        .help()
        .alias('help', 'h')
        .parse();
}

const args = parseArguments();

settings.mindserver_port = args.mindserver_port;

await Mindcraft.init(false, settings.mindserver_port, settings.auto_open_ui);

console.log(`Mindcraft initialized with MindServer at localhost:${settings.mindserver_port}`); 