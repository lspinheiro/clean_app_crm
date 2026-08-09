import { BubbleCluster } from "./bubble-cluster";

type PlaceholderPageProps = {
  description: string;
  title: string;
};

export function PlaceholderPage({ description, title }: PlaceholderPageProps) {
  return (
    <main className="page-shell">
      <h1 className="page-heading">{title}</h1>
      <section className="empty-workspace">
        <BubbleCluster />
        <h2>This workspace is ready.</h2>
        <p>{description}</p>
      </section>
    </main>
  );
}
