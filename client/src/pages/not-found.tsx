import { Link } from "wouter";
export default function NotFound() {
  return (
    <div className="wrap py-24 grid gap-5 justify-items-start">
      <span className="num muted">ERROR 404</span>
      <h1 className="d-1">Fuera del mapa</h1>
      <p className="lead">Esta página no existe o se ha movido.</p>
      <Link href="/" className="btn btn-rojo">Volver al inicio</Link>
    </div>
  );
}
