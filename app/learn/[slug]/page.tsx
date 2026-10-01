import { redirect } from "next/navigation";

export default async function LearnIndex({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/courses/${(await params).slug}`);
}
