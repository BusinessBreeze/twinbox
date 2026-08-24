import { dbFindOne } from "#layers/nuxt-base-app/server/db/wrappers/db_find_one";
// import { accounts } from "#layers/nuxt-base-app/server/db/schema";
import { accounts } from "hub:db:schema";

export const findOwnerFromParsedEmail = async (body: any) => {
    // 1. Try resolving owner via X-Forwarded-To -> account.email
    let owner: any = null;
    const xForwardedTo = body.headers?.get?.('x-forwarded-to');
    if (xForwardedTo) {
        const target = Array.isArray(xForwardedTo) ? xForwardedTo[0] : xForwardedTo;
        owner = await dbFindOne(db, accounts, { email: target });
    }

    // 2. Try resolving owner via body.to -> account.user
    if (!owner) {
        owner = await dbFindOne(db, accounts, { user: body.to });
    }

    // 3. Try resolving owner via body.to -> account.email
    if (!owner) {
        owner = await dbFindOne(db, accounts, { email: body.to });
    }

    return owner;
}