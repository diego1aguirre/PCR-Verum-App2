import styles from './Page.module.css'

export default function Configuracion() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Configuración</h1>
      <div className="card">
        <p className={styles.placeholder}>
          Aquí podrás ajustar las preferencias de la aplicación.
        </p>
        <div className={styles.actions}>
          <input className="form-input" placeholder="Nombre de usuario" />
          <button className="btn-primary">Guardar cambios</button>
        </div>
      </div>
    </div>
  )
}
