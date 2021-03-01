<template>
  <v-app>
    <v-app-bar app color="#5d6e7d" light collapse-on-scroll>
      <div class="d-flex align-center">
        <v-img
          alt="Holliston MA Town Seal"
          class="shrink mr-2"
          contain
          src="https://www.townofholliston.us/sites/all/themes/custom/sites/hollistonma/vts_hollistonma/logo.png"
          width="414"
        />
      </div>

      <v-spacer></v-spacer>

      <v-btn
        href="https://github.com/vuetifyjs/vuetify/releases/latest"
        target="_blank"
        text
      >
        <span class="mr-2">API Docs</span>
        <v-icon>mdi-open-in-new</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-simple-table>
        <template v-slot:default>
          <thead>
            <tr>
              <th class="text-left">Address</th>
              <th class="text-left">Buyer</th>
              <th class="text-left">Seller</th>
              <th class="text-left">Price</th>
              <th class="text-left">Month Sold</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in desserts" :key="item.name">
              <td>{{ item.name }}</td>
              <td>{{ item.calories }}</td>
            </tr>
          </tbody>
        </template>
      </v-simple-table>
    </v-main>
  </v-app>
</template>

<script>
export default {
  name: 'App',

  data: () => ({
    dense: false,
    fixedHeader: false,
    height: 300,
    desserts: [
      {
        name: 'Baked Yogurt',
        calories: 159
      },
      {
        name: 'Melty Ice cream sandwich',
        calories: 237
      },
      {
        name: 'Eclair',
        calories: 262
      },
      {
        name: 'Cupcake',
        calories: 305
      },
      {
        name: 'Gingerbread',
        calories: 356
      },
      {
        name: 'Jelly bean',
        calories: 375
      },
      {
        name: 'Lollipop',
        calories: 392
      },
      {
        name: 'Honeycomb',
        calories: 408
      },
      {
        name: 'Donut',
        calories: 452
      },
      {
        name: 'KitKat',
        calories: 518
      }
    ]
  })
};
</script>
