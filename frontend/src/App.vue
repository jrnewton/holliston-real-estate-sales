<template>
  <main>
    <h1>{{ message }} <span class="badge badge-secondary">New</span></h1>
  </main>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      message: 'Hello, World'
    };
  }
};
</script>
