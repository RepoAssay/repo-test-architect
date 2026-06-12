import { parseInvoice } from "./invoiceParser";

describe("parseInvoice", () => {
  it("parses an invoice id and total", () => {
    expect(parseInvoice('{"id":"inv-1","total":120}')).toEqual({
      id: "inv-1",
      total: 120
    });
  });
});
