import { fmtDate, methodLabel, money } from "./format";
import type { InvoiceData } from "./invoiceTypes";

interface Props {
  invoice: InvoiceData;
  width?: "80mm" | "58mm";
}

export function ThermalInvoice({ invoice, width = "80mm" }: Props) {
  const { gstMode, seller, customer, totals } = invoice;
  const m = (v: number) => money(v, invoice.currency);
  const intra = gstMode === "INTRA_STATE";
  const inter = gstMode === "INTER_STATE";
  const gst = gstMode !== "NONE";

  return (
    <article className={`thermal-invoice thermal-invoice--${width === "80mm" ? "80" : "58"}`} data-paper-width={width}>
      <header className="thermal-header">
        {seller.logoUrl && <img src={seller.logoUrl} alt={`${seller.name} logo`} className="thermal-logo" />}
        <h1>{seller.name}</h1>
        {seller.address && <p>{seller.address}</p>}
        {seller.gstin && <p><strong>GSTIN:</strong> {seller.gstin}</p>}
        {seller.phone && <p><strong>Phone:</strong> {seller.phone}</p>}
        <div className="thermal-divider" />
        <h2>{gst ? "TAX INVOICE" : "INVOICE"}</h2>
      </header>

      <section className="thermal-details">
        <div className="thermal-row"><span>Invoice no:</span><strong>{invoice.invoiceNumber}</strong></div>
        <div className="thermal-row"><span>Date:</span><strong>{fmtDate(invoice.invoiceDate, true)}</strong></div>
        {invoice.placeOfSupply && <div className="thermal-row"><span>Supply:</span><strong>{invoice.placeOfSupply}</strong></div>}
      </section>

      <div className="thermal-divider" />

      <section className="thermal-customer">
        <strong>Bill to:</strong>
        <p className="thermal-customer-name">{customer.name}</p>
        {customer.address && <p>{customer.address}</p>}
        {customer.gstin && <p>GSTIN: {customer.gstin}</p>}
        {customer.phone && <p>Phone: {customer.phone}</p>}
      </section>

      <div className="thermal-divider" />

      <section className="thermal-items">
        {invoice.items.map((item, i) => (
          <div className="thermal-item" key={item.id}>
            <div className="thermal-item-heading"><strong>{i + 1}. {item.description}</strong></div>
            {item.detail && <p>{item.detail}</p>}
            {item.hsnSac && <div className="thermal-row"><span>HSN/SAC:</span><span>{item.hsnSac}</span></div>}
            <div className="thermal-row"><span>{item.quantity} {item.unit} × {m(item.rate)}</span><span>{m(gst ? item.taxableAmount : item.totalAmount)}</span></div>
            {gst && <div className="thermal-row"><span>GST {item.gstRate}%</span><span>{m(item.taxAmount)}</span></div>}
            {gst && <div className="thermal-row thermal-item-total"><span>Item total</span><span>{m(item.totalAmount)}</span></div>}
            {i < invoice.items.length - 1 && <div className="thermal-dotted-divider" />}
          </div>
        ))}
      </section>

      <div className="thermal-divider" />

      <section className="thermal-totals">
        <div className="thermal-row"><span>Subtotal:</span><span>{m(totals.subtotal)}</span></div>
        {intra && <><div className="thermal-row"><span>CGST:</span><span>{m(totals.cgst)}</span></div><div className="thermal-row"><span>SGST:</span><span>{m(totals.sgst)}</span></div></>}
        {inter && <div className="thermal-row"><span>IGST:</span><span>{m(totals.igst)}</span></div>}
        <div className="thermal-grand-total"><span>TOTAL</span><strong>{m(totals.total)}</strong></div>
        <div className="thermal-row"><span>Paid:</span><span>{m(totals.paid)}</span></div>
        {totals.returns > 0 && <div className="thermal-row"><span>Returns:</span><span>{m(totals.returns)}</span></div>}
        <div className="thermal-row"><strong>{totals.credit > 0 ? "Credit:" : "Balance due:"}</strong><strong>{m(totals.credit > 0 ? totals.credit : totals.balanceDue)}</strong></div>
      </section>

      {invoice.payments.length > 0 && (
        <section className="thermal-payment">
          {invoice.payments.map((p) => (
            <div className="thermal-row" key={p.method}><span>{methodLabel(p.method)}:</span><span>{m(p.amount)}</span></div>
          ))}
        </section>
      )}

      {invoice.amountInWords && (
        <section className="thermal-amount-words"><strong>In words:</strong><p>{invoice.amountInWords}</p></section>
      )}
      {invoice.notes && <section className="thermal-notes"><strong>Notes:</strong><p>{invoice.notes}</p></section>}

      <footer className="thermal-footer">
        <div className="thermal-divider" />
        <strong>Thank you!</strong>
        <p>Computer-generated invoice.</p>
        <p>For {seller.name}</p>
        <p>Authorized signatory</p>
      </footer>
    </article>
  );
}
