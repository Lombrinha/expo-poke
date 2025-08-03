import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
interface PokemonListItem {
  name: string;
  url: string;
}
interface Pokemon {
  id: number;
  name: string;
  sprite: string;
}
const API_URL = 'https://pokeapi.co/api/v2/pokemon';
export default function PokedexScreen() {
  const [pokemonList, setPokemonList] = useState<Pokemon[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(API_URL);
  const [isLoading, setIsLoading] = useState(false);
  const fetchPokemonDetails = async (results: PokemonListItem[]): Promise<Pokemon[]> => {
    const promises = results.map(async (p) => {
      const res = await fetch(p.url);
      const data = await res.json();
      return {
        id: data.id,
        name: data.name,
        sprite: data.sprites.front_default,
      };
    });
    return Promise.all(promises);
  };
  const loadMorePokemon = useCallback(async () => {
    if (!nextUrl || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(nextUrl);
      const data = await response.json();
      const detailedPokemon = await fetchPokemonDetails(data.results);
      setPokemonList((prevList) => [...prevList, ...detailedPokemon]);
      setNextUrl(data.next);
    } catch (error) {
      console.error("Erro ao carregar a Pokédex:", error);
    } finally {
      setIsLoading(false);
    }
  }, [nextUrl, isLoading]);
  useEffect(() => {
    loadMorePokemon();
  }, []);
  const renderItem = ({ item }: { item: Pokemon }) => (
    <Link href={`/pokedex/${item.name}`} asChild>
      <TouchableOpacity style={styles.card}>
        <Image source={{ uri: item.sprite }} style={styles.sprite} onError={() => console.log(`Failed to load image for ${item.name}`)} />
        <Text style={styles.name}>{`#${item.id} ${item.name.charAt(0).toUpperCase() + item.name.slice(1)}`}</Text>
      </TouchableOpacity>
    </Link>
  );

  // Renders the loading indicator at the bottom of the list
  const renderFooter = () => {
    if (!isLoading) return null;
    return <ActivityIndicator size="large" color="#CC0000" style={{ marginVertical: 20 }} />;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={pokemonList}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.list}
        onEndReached={loadMorePokemon}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  list: {
    padding: 8,
  },
  card: {
    flex: 1,
    margin: 8,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  sprite: {
    width: 100,
    height: 100,
  },
  name: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});