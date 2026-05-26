import { redirect } from "next/navigation";

export default async function CompanyMessagesPage(props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  redirect(`/chat?chatType=company&companyId=${encodeURIComponent(companyId)}`);
}
