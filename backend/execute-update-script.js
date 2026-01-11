// Script para ejecutar desde la consola del navegador en el admin panel
// Copia y pega esto en la consola (F12) cuando estés logueado en el admin panel

(async () => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      console.error('❌ No se encontró el token JWT. Por favor, inicia sesión primero.');
      return;
    }

    console.log('🔄 Ejecutando script de actualización...');
    
    const response = await fetch('https://cms-woad-delta.vercel.app/api/admin/update-sites-and-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ Resultado:', data);
    
    if (data.success) {
      console.log('\n📋 Resumen:');
      if (data.results.testFrontend) {
        console.log(`- Sitio test-frontend: ${data.results.testFrontend.updated ? '✅ Actualizado a "cineclube"' : '⚠️ No encontrado'}`);
      }
      if (data.results.reactFrontend) {
        console.log(`- Sitio react-frontend: ${data.results.reactFrontend.updated ? '✅ Actualizado a "sympaathy"' : '⚠️ No encontrado'}`);
      }
      if (data.results.user) {
        console.log(`- Usuario: ${data.results.user.created ? '✅ Creado' : '✅ Actualizado'} - ${data.results.user.email}`);
      }
      if (data.results.userSite) {
        console.log(`- Asignación: ✅ Usuario asignado al sitio "${data.results.userSite.siteName}"`);
      }
    }
  } catch (error) {
    console.error('❌ Error ejecutando script:', error);
  }
})();

