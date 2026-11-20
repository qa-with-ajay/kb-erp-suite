import { fmtDate, methodLabel, money } from "./format";
import type { InvoiceData } from "./invoiceTypes";

export function A4Invoice({ invoice }: { invoice: InvoiceData }) {
  const { gstMode, seller, customer, totals } = invoice;
  const cur = invoice.currency;
  const m = (v: number) => money(v, cur);
  const intra = gstMode === "INTRA_STATE";
  const inter = gstMode === "INTER_STATE";
  const gst = gstMode !== "NONE";
  const showHsn = invoice.items.some((i) => i.hsnSac);

  return (
    <article className="a4-invoice">
      <header className="a4-invoice-header">
        <div className="a4-company-details">
          {seller.logoUrl && <img src={seller.logoUrl} alt={`${seller.name} logo`} className="a4-company-logo" />}
          <div>
            <h1>{seller.name}</h1>
            {seller.legalName && <p>{seller.legalName}</p>}
            {seller.address && <p>{seller.address}</p>}
            {seller.gstin && <p><strong>GSTIN:</strong> {seller.gstin}</p>}
            {seller.phone && <p><strong>Phone:</strong> {seller.phone}</p>}
            {seller.email && <p><strong>Email:</strong> {seller.email}</p>}
          </div>
        </div>
        <div className="a4-invoice-heading">
          <h2>{gst ? "TAX INVOICE" : "INVOICE"}</h2>
        </div>
      </header>

      <section className="a4-invoice-meta">
        <div>
          <h3>Bill to</h3>
          <p className="a4-customer-name">{customer.name}</p>
          {customer.address && <p>{customer.address}</p>}
          {customer.gstin && <p><strong>GSTIN:</strong> {customer.gstin}</p>}
          {customer.phone && <p><strong>Phone:</strong> {customer.phone}</p>}
        </div>
        <div className="a4-invoice-info">
          <table>
            <tbody>
              <tr><th>Invoice no.</th><td>{invoice.invoiceNumber}</td></tr>
              <tr><th>Date</th><td>{fmtDate(invoice.invoiceDate, true)}</td></tr>
              {invoice.placeOfSupply && <tr><th>Place of supply</th><td>{invoice.placeOfSupply}</td></tr>}
              {invoice.location && <tr><th>Location</th><td>{invoice.location}</td></tr>}
              {invoice.issuedBy && <tr><th>Issued by</th><td>{invoice.issuedBy}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a4-items-section">
        <table className="a4-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              {showHsn && <th>HSN/SAC</th>}
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              {gst && <th className="num">Taxable</th>}
              {gst && <th className="num">GST %</th>}
              {intra && <><th className="num">CGST</th><th className="num">SGST</th></>}
              {inter && <th className="num">IGST</th>}
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id}>
                <td>{i + 1}</td>
                <td>
                  {item.description}
                  {item.detail && <div className="a4-detail">{item.detail}</div>}
                </td>
                {showHsn && <td>{item.hsnSac || "—"}</td>}
                <td className="num">{item.quantity} {item.unit}</td>
                <td className="num">{m(item.rate)}</td>
                {gst && <td className="num">{m(item.taxableAmount)}</td>}
                {gst && <td className="num">{item.gstRate}%</td>}
                {intra && <><td className="num">{m(item.cgstAmount)}</td><td className="num">{m(item.sgstAmount)}</td></>}
                {inter && <td className="num">{m(item.igstAmount)}</td>}
                <td className="num">{m(item.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="a4-invoice-summary">
        <div>
          {invoice.amountInWords && (
            <div className="a4-amount-words">
              <strong>Amount in words</strong>
              <p>{invoice.amountInWords}</p>
            </div>
          )}
          {invoice.payments.length > 0 && (
            <div className="a4-amount-words a4-payments">
              <strong>Payments received</strong>
              {invoice.payments.map((p) => (
                <p key={p.method}>{methodLabel(p.method)}: {m(p.amount)}</p>
              ))}
            </div>
          )}
        </div>

        <div className="a4-totals">
          <table>
            <tbody>
              <tr><th>Subtotal</th><td>{m(totals.subtotal)}</td></tr>
              {intra && <><tr><th>CGST</th><td>{m(totals.cgst)}</td></tr><tr><th>SGST</th><td>{m(totals.sgst)}</td></tr></>}
              {inter && <tr><th>IGST</th><td>{m(totals.igst)}</td></tr>}
              <tr className="a4-grand-total"><th>Grand total</th><td>{m(totals.total)}</td></tr>
              <tr><th>Amount paid</th><td>{m(totals.paid)}</td></tr>
              {totals.returns > 0 && <tr><th>Returns / credit notes</th><td>{m(totals.returns)}</td></tr>}
              <tr><th>{totals.credit > 0 ? "Customer credit" : "Balance due"}</th><td>{m(totals.credit > 0 ? totals.credit : totals.balanceDue)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {gst && invoice.taxSummary.length > 0 && (
        <section className="a4-tax-summary">
          <table className="a4-items-table">
            <thead>
              <tr>
                <th>GST %</th><th className="num">Taxable value</th>
                {intra && <><th className="num">CGST</th><th className="num">SGST</th></>}
                {inter && <th className="num">IGST</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.taxSummary.map((r) => (
                <tr key={r.rate}>
                  <td>{r.rate}%</td><td className="num">{m(r.taxable)}</td>
                  {intra && <><td className="num">{m(r.cgst)}</td><td className="num">{m(r.sgst)}</td></>}
                  {inter && <td className="num">{m(r.igst)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {invoice.notes && (
        <section className="a4-invoice-notes"><strong>Notes</strong><p>{invoice.notes}</p></section>
      )}

      <footer className="a4-invoice-footer">
        <div>
          <strong>Thank you for your business.</strong>
          <p>This is a computer-generated invoice.</p>
        </div>
        <div className="a4-signature">
          <p>For {seller.name}</p>
          <div className="a4-signature-space" />
          <strong>Authorized signatory</strong>
        </div>
      </footer>
    </article>
  );
}
