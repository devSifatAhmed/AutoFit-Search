import defaultFields from "../data/fields.json";
export async function getFields(admin) {
    const response = await admin.graphql(`
        query AppMetafields {
            currentAppInstallation {
                metafields(first: 100) {
                    edges {
                        node {
                            key
                            value
                        }
                    }
                }
            }
        }
    `);
    const json = await response.json();
    const metafields = json.data.currentAppInstallation.metafields.edges;
    const fieldsMetafield = metafields.find(metafield => metafield.node.key === "fields");
    const fields = fieldsMetafield ? JSON.parse(fieldsMetafield.node.value) : defaultFields;
    return fields;
}