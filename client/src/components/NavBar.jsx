import { Link, useLocation } from 'react-router-dom'
import '../Design/NavBar.css'

export default function NavBar() {
  const { pathname } = useLocation()

  const links = [
    { to: '/', label: 'Recebimento' },
    { to: '/estatistica', label: 'Estatística' },
    { to: '/analise', label: 'Análise' },
    { to: '/procurador', label: 'Procurador de preços' },
    {to: '/pesquisa', label: 'Noticias do meu mercado'},
  ]

  const isActive = (to) => {
    // ativo quando é exatamente o path ou prefixo (ex.: /estatistica/detalhe)
    return pathname === to || (to !== '/' && pathname.startsWith(to))
  }

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <div className="navbar__brand">
          <div className="navbar__logo">FC</div>
          <div className="navbar__titles">
            <span className="navbar__title">FluxCompras</span>
            <span className="navbar__subtitle">Painel do Comprador</span>
          </div>
        </div>

        <nav className="navbar__links" aria-label="Navegação principal">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`nav-item ${isActive(to) ? 'active' : ''}`}
              aria-current={isActive(to) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
