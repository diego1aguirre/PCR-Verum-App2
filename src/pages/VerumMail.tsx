import styles from './Page.module.css'

export default function VerumMail() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Verum Mail</h1>
      <div className="card">
        <p className={styles.placeholder}>
          Aquí aparecerá la herramienta de correo electrónico.
        </p>
        <div className={styles.actions}>
          <button className="btn-primary">Nuevo correo</button>
          <button className="btn-secondary">Ver bandeja</button>
        </div>
      </div>
    </div>
  )
}
