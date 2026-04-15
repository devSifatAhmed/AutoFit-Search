import { useNavigation } from "react-router"
import Loader from '../components/essentials/Loader'
import Section from '../components/essentials/Section'
import Text from '../components/essentials/Text'
export default function Index() {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  if (isLoading) {
    return (
      <Loader />
    )
  }
  return (
    <s-page>
      <s-stack paddingBlock='small large'>
        <Text as='h2'>Dashboard</Text>
        <s-paragraph color='subdued'>
          Manage your search widgets in one place
        </s-paragraph>
      </s-stack>

      <s-grid gridTemplateColumns='repeat(2, 1fr)' gap='base small'>
        <s-grid-item>
          <Section>
            <s-stack direction='inline' justifyContent='space-between' padding='small' alignItems='center'>
              <s-heading>Seach form</s-heading>
              <s-badge tone='success'>Actives</s-badge>
            </s-stack>
            <s-divider />
            <s-stack padding='small' gap='small'>
              <s-paragraph color='subdued'>
                Search form allows customers to find products by selecting criteria like year, make, and model.
              </s-paragraph>
              <s-box borderRadius='base' overflow='hidden' border='base' padding='small'>
                <img src='/dashboard-main-widget.svg' />
              </s-box>
            </s-stack>
            <s-divider />
            <s-stack padding='small' direction='inline' alignItems='center' gap='small'>
              <s-button variant='primary'>Settings</s-button>
              <s-button variant='secondary'>Preview</s-button>
            </s-stack>
          </Section>
        </s-grid-item>
      </s-grid>
    </s-page>
  )
}