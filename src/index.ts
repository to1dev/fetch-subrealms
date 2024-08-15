import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { fetchApiServer } from './utils';

const PUBLIC_ELECTRUMX_ENDPOINT1 = 'blockchain.atomicals.find_subrealms';
const PUBLIC_ELECTRUMX_ENDPOINT2 = 'blockchain.atomicals.get_state';
const PUBLIC_ELECTRUMX_ENDPOINT3 = 'blockchain.atomicals.list';

interface SubrealmResult {
    atomical_id: string;
    status: string;
    subrealm: string;
    subrealm_hex: string;
    tx_num: number;
}

interface SubrealmData {
    id: string;
    number: number;
    mintAddress: string;
    address: string;
    pid: string;
}

const mainnet = {
    bech32: 'bc',
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80,
};

function scriptAddress(hexScript: string): string | null {
    if (!hexScript) {
        return null;
    }

    const addr = btc.Address(mainnet);
    const script = hex.decode(hexScript);
    const parsedScript = btc.OutScript.decode(script);
    const parsedAddress = addr.encode(parsedScript);

    return parsedAddress;
}

async function getRealms(env: Env, page: number) {
    const pageSize = 100;
    const offset = page * pageSize;
    const sql = `SELECT RealmId FROM _realms ORDER BY RealmNumber LIMIT ${pageSize} OFFSET ${offset}`;
    const { results } = await env.MY_DB.prepare(sql).all();
    console.log(results);
}

export default {
    async scheduled(event, env, ctx): Promise<void> {
        switch (event.cron) {
            case '* * * * *':
                try {
                    await getRealms(env, 0);
                } catch (e) {
                    console.error('getRealms error', e);
                }

                break;

            case '*/5 * * * *':
                console.log('every 5 mins');

                break;

            default:
                break;
        }

        console.log('cron processed');
    },

    async fetch(req, env, ctx) {
        return new Response('Hello world!', { headers: { 'Content-Type': 'application/json' } });
    },
} satisfies ExportedHandler<Env>;
