import type { CSSProperties } from "react";

const tableHeaderStyle: CSSProperties = {
  backgroundColor: "#ff1593",
  color: "#030303"
};

export function TableHeaderRow({ columns }: { columns: string[] }) {
  return <div className="row heading table-heading" role="row" style={tableHeaderStyle}>
    {columns.map((column) => <span role="columnheader" key={column}>{column}</span>)}
  </div>;
}
