import { Table } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const title = "Empty Table";

const DevnutEmpty = () => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Table />
      </EmptyMedia>
      <EmptyTitle>No data to display</EmptyTitle>
      <EmptyDescription>
        There are no records in this table yet. Add your first entry to get
        started.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export default DevnutEmpty;
