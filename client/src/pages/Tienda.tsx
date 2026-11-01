import { Link, useParams } from "wouter";
import { PageHead, Empty } from "@/components/ui-vants";

const CATS: Record<string, string> = { camisetas: "Camisetas", hoodies: "Hoodies", jerseys: "Jerseys", accesorios: "Accesorios" };

/**
 * Tienda: sin catálogo conectado no hay productos, carrito ni compra.
 * Cuando exista el catálogo (Stripe/proveedor), esta página leerá /api/store/products.
 */
export default function Tienda() {
  const { cat } = useParams<{ cat?: string }>();
  const titulo = cat && CATS[cat] ? CATS[cat] : "Tienda oficial";
  return (
    <>
      <PageHead eyebrow="Tienda" title={titulo} lead="Ropa y accesorios oficiales de VANTS." />
      <div className="wrap grid gap-6">
        <div className="tabs" role="tablist">
          <Link href="/tienda" role="tab" className="tab" aria-selected={!cat}>Todo</Link>
          {Object.entries(CATS).map(([k, l]) => <Link key={k} href={"/tienda/" + k} role="tab" className="tab" aria-selected={cat === k}>{l}</Link>)}
        </div>
        <Empty
          code={"tienda · " + (cat || "catálogo") + " · 0 productos"}
          title="La tienda todavía no está a la venta"
          text="La Colección 01 se anunciará en Noticias y en el Discord oficial. No hay carrito ni pagos hasta que el catálogo esté conectado a un sistema de comercio real."
          action={<Link href="/noticias" className="link-arrow">Ver anuncios →</Link>}
        />
      </div>
    </>
  );
}
