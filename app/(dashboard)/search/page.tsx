import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SearchResults } from "@/components/search/search-results";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("search");
  return { title: t("title") };
}
