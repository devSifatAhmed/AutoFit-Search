import { useNavigation } from "react-router"
import Loader from '../components/essentials/Loader'
import Text from '../components/essentials/Text'
export default function DatabaseEdit() {
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    if (isLoading) {
        return (
            <Loader />
        )
    }
    return (
        <s-page>
            <s-stack paddingBlock="base large">
                <s-grid gridTemplateColumns="auto 1fr">
                    <s-box>
                        <s-grid gridTemplateColumns="auto 1fr" gap="base">
                            <s-button variant="secondary" icon="arrow-left" />
                            <Text as="h2">Add search entry</Text>
                        </s-grid>
                    </s-box>
                    <s-box>
                        <s-stack direction="inline" alignItems="center" justifyContent="end" gap="small">
                            <s-button variant="secondary">Cancel</s-button>
                            <s-button variant="primary">Save</s-button>
                            <s-button variant="primary">Save & add next</s-button>
                        </s-stack>
                    </s-box>
                </s-grid>
            </s-stack>
        </s-page>
    )
}