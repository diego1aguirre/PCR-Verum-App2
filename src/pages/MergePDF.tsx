import styles from './Page.module.css'

export default function MergePDF() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Merge PDF</h1>
      <div className="card">
        <p className={styles.placeholder}>
          Aquí podrás combinar múltiples archivos PDF en uno solo.
        </p>
        <div className={styles.actions}>
          <button className="btn-secondary">Agregar archivos</button>
          <button className="btn-primary">Combinar PDF</button>
        </div>
      </div>
    </div>
  )
}
