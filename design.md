# DynamoDB Single Table Design

Pimary Key is either

- simple (partition key)
- composite (partition + sort key).

The pimary key must uniquely identify an item.

## Potential Access Patterns

### A - Show transactions by month/year or just by year.

This is already possible by viewing the original website so probably not that useful.

```
PK: year#<year>
SK: <month>#<price>#<full address>
```

or

```
PK: month#<year>#<month>
SK: <price>#<full address>
```

### B - show transactions for a single address.

Maybe useful but probably too narrow in definition.

```
PK: address#<full address>
SK: <year>#<month>
```

### C - show transactions for a single street.

Maybe just right?

```
PK - street#<street name>
SK - <YYMM>#<price>#<street number> (maybe put price into a secondary index?)
```
