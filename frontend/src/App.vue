<template>
  <main>
    <h1>{{ message }} <span class="badge badge-secondary">World</span></h1>
    <div v-for="item in data" :key="item.price">
      {{ item.address }}
    </div>
  </main>
</template>

<script>
import Axios from 'axios';

export default {
  name: 'App',
  data() {
    return {
      message: 'Hello',
      count: 0,
      data: []
    };
  },
  async mounted() {
    try {
      const response = await Axios.get(
        'https://s1l04bl4xb.execute-api.us-east-2.amazonaws.com/api/v1/all',
        {
          headers: {
            'X-API-KEY': 'bGsojGsloB1hLQBFN3Ddc8KQ29wZnhbdaIRxlXza'
          }
        }
      );
      console.log('response', response);
      this.data = response.data.data;
      this.count = response.data.count;
      console.log('data', this.data);
    } catch (error) {
      console.error('failed to call API', error);
    }
  }
};
</script>
