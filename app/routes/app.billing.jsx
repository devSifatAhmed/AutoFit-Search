import { useNavigation } from 'react-router';
import Loader from '../components/essentials/Loader'

export default function Billing() {
    // default page loading spinner start
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    // default page loading spinner end
    if (isLoading) {
        return (
            <Loader />
        )
    }
    return (
        <s-stack gap="large">
            <s-box>
                <s-grid columns="1fr" gap="small">
                    <s-paragraph>
                        This is the billing page. You can manage your billing information and view your invoices here.
                    </s-paragraph>
                </s-grid>
            </s-box>
        </s-stack>
    );
}