import { useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import RowEditorPage from "../components/pages/database/RowEditorPage";

export async function action({ request, params }) {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const { updateRow } = await import("../utils/rows.server");
    const { syncStorefrontConfig } = await import("../utils/storefrontConfig.server");
    const payload = {
        ...Object.fromEntries(formData),
        rowId: params.rowId,
    };

    try {
        const response = await updateRow({ admin, data: payload });
        await syncStorefrontConfig(admin, payload.shopId);
        return response;
    } catch (error) {
        console.error("Failed to update row", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unable to update row",
        };
    }
}

export async function loader({ request, params }) {
    const { admin } = await authenticate.admin(request);
    const { getFields } = await import("../utils/fields.server");
    const { getShopData } = await import("../utils/shopData.server");
    const { getRowEditorData, hydrateEditorAttachments } = await import("../utils/rows.server");
    const shopData = await getShopData(admin);
    const fields = await getFields({ admin, shopId: shopData.id, suggestions: true });
    const editorData = await getRowEditorData({ shopId: shopData.id, rowId: params.rowId });
    const initialAttachments = await hydrateEditorAttachments(admin, editorData.attachmentMode, editorData.attachments);

    return {
        fields,
        shopData,
        initialFieldData: editorData.fieldData,
        initialAttachments,
        initialAttachmentMode: editorData.attachmentMode,
        rowId: params.rowId,
    };
}

export default function DatabaseEditRoute() {
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    const {
        fields,
        shopData,
        initialFieldData,
        initialAttachments,
        initialAttachmentMode,
        rowId,
    } = useLoaderData();

    return (
        <RowEditorPage
            mode="edit"
            fields={fields}
            shopData={shopData}
            initialFieldData={initialFieldData}
            initialAttachments={initialAttachments}
            initialAttachmentMode={initialAttachmentMode}
            isLoading={isLoading}
            submitPath={`/app/database/edit/${rowId}`}
            rowId={rowId}
        />
    );
}
