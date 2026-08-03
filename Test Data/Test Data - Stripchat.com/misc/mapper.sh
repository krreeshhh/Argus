while read sub; do
  ip=$(dig +short "$sub" | head -n 1)
  echo "$sub : $ip"
done < all_subs_deep.txt
