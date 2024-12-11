import { dbConnection, DbPartition } from "../persistence/db.ts";
import generator, { detector, MegalodonInterface } from "megalodon"


export async function authenticate(partition: DbPartition /* dbpartition is also account name */): Promise<MegalodonInterface>{
    const db = await dbConnection.getValueAsync();
    const existingAuth = await db.get<StoredAuth>(authDbKey(partition));
    if (existingAuth.value !== null){
        return getAuthenticatedClient(existingAuth.value)
    }

    const instanceDomain = partition.split('@')[1]
    if (instanceDomain === undefined){
        throw new Error("account is not of the correct form")
    }

    const baseUrl = "https://"+instanceDomain
    const software = await detector(baseUrl);
    const client = generator.default(software, baseUrl)
    const appData = await client.registerApp('gts-backdated-import', {
        website: "https://github.com/vivlim/gts-backdated-import"
    });

    console.log(`go to ${appData.url} and log in`)

    const code = prompt("paste the authorization code")
    if (!code){
        throw new Error("authorization code was not provided.")
    }
    const data: StoredAuth = {
        appData,
        software,
        baseUrl,
        tokenData : await client.fetchAccessToken(appData.client_id, appData.client_secret, code)
    }

    await db.set(authDbKey(partition), data)
    return getAuthenticatedClient(data)
}

function getAuthenticatedClient(auth: StoredAuth): MegalodonInterface{
    return generator.default(auth.software, auth.baseUrl, auth.tokenData.access_token)
}

export function authDbKey(partition: DbPartition): Deno.KvKey {
    return [partition, 'auth']
}

interface StoredAuth {
    appData: generator.OAuth.AppData
    tokenData: generator.OAuth.TokenData
    software: 'mastodon' | 'pleroma' | 'friendica' | 'firefish' | 'gotosocial'
    baseUrl: string

}