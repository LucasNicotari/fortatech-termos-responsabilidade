(() => {
  const storedTheme = localStorage.getItem('fortadocs-theme');
  const theme = storedTheme === 'dark' || storedTheme === 'light'
    ? storedTheme
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#18212b' : '#ffffff');
})();
