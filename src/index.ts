import { base64, hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { fetchApiServer } from './utils';

const PUBLIC_ELECTRUMX_ENDPOINT1 = 'blockchain.atomicals.find_subrealms';
const PUBLIC_ELECTRUMX_ENDPOINT2 = 'blockchain.atomicals.get_state';
const PUBLIC_ELECTRUMX_ENDPOINT3 = 'blockchain.atomicals.list';

interface RealmResult {
    RealmName: string;
    RealmId: string;
    RealmNumber: number;
    RealmMinter: string;
    RealmOwner: string;
    ProfileId: string;
}

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

/*async function processRealms(env: Env, results: RealmResult[]) {
    if (results.length > 0) {
        const endpoint = PUBLIC_ELECTRUMX_ENDPOINT1;

        try {
            for (const result of results) {
                const realm = result?.realm;
                const id = result?.atomical_id;
                const data = await getRealm(id);
                if (data) {
                    await saveToD1(env, realm, data);
                }
            }
        } catch (e) {
            console.error('error processing realms', e);
        }
    }
}*/

async function getRealms(env: Env, page: number): Promise<boolean | null> {
    const pageSize = 400;
    const offset = page * pageSize;
    const sql = `SELECT RealmId FROM _realms ORDER BY RealmNumber LIMIT ${pageSize} OFFSET ${offset}`;
    let needMore = false;

    try {
        const { results } = await env.MY_DB.prepare(sql).all();

        if (!results) {
            return null;
        }

        const len = results.length;
        if (len > 0) {
            //await processRealms(env, results);

            if (len < pageSize) {
                needMore = false;
            } else {
                needMore = true;
            }
        }
    } catch (e) {
        console.error('Failed to fetch subrealms:', e);
        return null;
    }

    return needMore;
}

interface CacheData {
    counter: number;
    current: number;
    fuckoff: number;
}

export default {
    async scheduled(event, env, ctx): Promise<void> {
        switch (event.cron) {
            case '* * * * *':
                break;

            case '*/5 * * * *':
                const cacheKey = `counter:fetch-subrealms`;
                const cachedData = await env.api.get<CacheData>(cacheKey, { type: 'json' });
                let counter = cachedData?.counter || 0;
                let current = cachedData?.current || 0;
                let fuckoff = cachedData?.fuckoff || 0;
                try {
                    const needMore = await getRealms(env, counter);
                    if (needMore === null) {
                        fuckoff = fuckoff + 1;
                    } else {
                        if (needMore) {
                            counter = counter + 1;
                        } else {
                            counter = 0;
                        }
                    }

                    if (counter > current) {
                        current = counter;
                    }

                    ctx.waitUntil(env.api.put(cacheKey, JSON.stringify({ counter, current, fuckoff })));
                } catch (e) {
                    console.error('getRealms error', e);
                }

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
