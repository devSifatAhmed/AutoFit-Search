export async function getCurrentAppInstallation(admin) {
    const response = await admin.graphql(`
        query {
            currentAppInstallation {
                id
            }
        }
    `);
    
    const json = await response.json();
    return json.data.currentAppInstallation.id;
}