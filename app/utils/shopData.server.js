export async function getShopData(admin) {
    const response = await admin.graphql(`
        #graphql
            query {
                shop {
                    name
                    id
                    email
                    url
                }
            }
    `);
    const responseJson = await response.json();
    const shopData = responseJson.data.shop || {};
    return shopData;
}
