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

interface RealmData {
    id: string;
    number: number;
    mintAddress: string;
    address: string;
    pid: string;
}

interface SubrealmData {
    id: string;
    number: number;
    mintAddress: string;
    address: string;
    pid: string;
}

interface CacheData {
    counter: number;
    current: number;
    sub_counter: number;
    sub_current: number;
    fuckoff: number;
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

async function saveToD1(env: Env, realm: string, data: RealmData): Promise<boolean> {
    async function _exists(realm: string): Promise<boolean> {
        const sql = `SELECT RealmName FROM _realms WHERE RealmName = ?1 LIMIT 1`;
        const _realm = await env.MY_DB.prepare(sql).bind(realm).first();
        return _realm !== null;
    }

    async function _save(): Promise<boolean> {
        const { success } = await env.MY_DB.prepare(
            `insert into _realms (RealmName, RealmId, RealmNumber, RealmMinter, RealmOwner, ProfileId) values (?1, ?2, ?3, ?4, ?5, ?6)`
        )
            .bind(realm, data?.id, data?.number, data?.mintAddress, data?.address, data?.pid)
            .run();
        return success;
    }

    async function _update(): Promise<boolean> {
        const { success } = await env.MY_DB.prepare(
            `update _realms set
                RealmOwner = ?1,
                ProfileId = ?2
             where RealmName = ?3`
        )
            .bind(data?.address, data?.pid, realm)
            .run();
        return success;
    }

    try {
        const exists = await _exists(realm);
        if (!exists) {
            return await _save();
        } else {
            return await _update();
        }
    } catch (e) {
        console.error('error saving to D1', e);
    }

    return false;
}

async function getRealm(id: string): Promise<any | null> {
    const endpoint = PUBLIC_ELECTRUMX_ENDPOINT2;
    const path: string = `${endpoint}?params=["${id}"]`;

    try {
        const res = await fetchApiServer(path);
        if (!res.ok) {
            throw new Error(`Error fetching data: ${res.statusText}`);
        }

        const data: any = await res.json();
        if (!data) {
            return null;
        }

        if (!data?.success) {
            console.error(`Error getting right json result: ${res.statusText}`);
            return null;
        }

        const type = data.response?.result?.type;
        const subtype = data.response?.result?.subtype;
        if (type === 'NFT' && ['realm', 'subrealm'].includes(subtype)) {
            const number = data.response?.result?.atomical_number;
            let mintAddress = scriptAddress(data.response?.result?.mint_info?.reveal_location_script);
            let address = scriptAddress(data.response?.result?.location_info[0]?.script);
            const pid = data.response?.result?.state?.latest?.d || null;

            return { id, number, mintAddress, address, pid };
        }
    } catch (e) {
        console.error('Failed to fetch realm:', e);
        return null;
    }

    return null;
}

async function getSubrealms(id: string, page: number) {
    const pageSize = 100;
    const offset = page * pageSize;
    let needMore = false;

    const endpoint = PUBLIC_ELECTRUMX_ENDPOINT1;
    const path: string = `${endpoint}?params=[${id},"",false,${pageSize},${offset}]`;

    try {
        const res = await fetchApiServer(path);
        if (!res.ok) {
            console.error(`Error fetching data: ${res.statusText}`);
            return;
        }

        const data = await res.json();
        if (!data) {
            return;
        }

        if (!data?.success) {
            console.error(`Error getting right json result: ${res.statusText}`);
            return;
        }

        const results = data.response?.result;
        if (!results) {
            return;
        }

        const len = results.length;
        if (len > 0) {
            if (len < pageSize) {
                needMore = false;
            } else {
                needMore = true;
            }
        }
    } catch (e) {
        console.error('Failed to fetch subrealms:', e);
        return;
    }
}

async function processRealms(env: Env, results: any[]) {
    if (results.length > 0) {
        try {
            for (const result of results) {
                const realm = result?.RealmName;
                const id = result?.RealmId;
            }
        } catch (e) {
            console.error('error processing realms', e);
        }
    }
}

async function getRealms(env: Env, page: number): Promise<boolean | null> {
    const pageSize = 100;
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
            await processRealms(env, results);

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

export default {
    async scheduled(event, env, ctx): Promise<void> {
        switch (event.cron) {
            case '* * * * *':
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
