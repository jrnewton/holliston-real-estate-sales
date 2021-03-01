<template>
  <main>
    <div class="jumbotron">
      <h1 class="display-4">Holliston Real Estate Sales</h1>
      <p class="lead">
        This website provides basic real estate sales data that is easy to
        search and available via API.
      </p>

      <hr class="my-4" />

      <div class="container">
        <div class="row">
          <h3
            class="col"
            style="text-transform: capitalize"
            v-for="label in headers"
            :key="label"
          >
            {{ label }}
          </h3>
        </div>
        <div class="row" v-for="item in data" :key="item.price">
          <div class="col" v-for="label in headers" :key="label">
            {{ item[label] }}
          </div>
        </div>
      </div>
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
      headers: [],
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

      this.data = response.data.data;
      this.count = response.data.count;

      if (this.count > 0) {
        for (let name in this.data[0]) {
          this.headers.push(name);
        }
      }
    } catch (error) {
      console.error('failed to call API', error);
    }
  }
};
</script>
