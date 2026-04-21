import styles from './Page.module.css'

export default function Formateador() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Formateador</h1>
      <div className="card">
        <p className={styles.placeholder}>
          Aquí aparecerá la herramienta de formateo de documentos.
        </p>
        <div className={styles.actions}>
          <input className="form-input" placeholder="Pega tu texto aquí…" />
          <button className="btn-primary">Formatear</button>
        </div>
      </div>
    </div>
  )
}
