import { Suspense } from "react";
import { SearchResults } from "@/components/search/search-results";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  );
}

export const metadata = { title: "Search – SAM" };
