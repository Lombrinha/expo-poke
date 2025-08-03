import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

// Interfaces
interface PokemonDetails {
  id: number;
  name: string;
  sprites: { front_default: string; front_shiny: string; back_default: string; back_shiny: string; };
  types: { slot: number; type: { name: string; }; }[];
  stats: { base_stat: number; stat: { name: string; }; }[];
  abilities: { ability: { name: string; url: string; }; is_hidden: boolean; }[];
  height: number;
  weight: number;
  species: { url: string };
}

interface PokemonSpecies {
    names: { language: { name: string }; name: string }[];
}

const API_URL = 'https://pokeapi.co/api/v2/pokemon';

// Mappings
const typeColors: { [key: string]: string } = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C',
  grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1',
  ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
  rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746',
  steel: '#B7B7CE', fairy: '#D685AD',
};

const translations = {
  en: { stats: 'Stats', abilities: 'Abilities', profile: 'Profile', height: 'Height', weight: 'Weight', sprites: 'Sprites', hidden: 'Hidden' },
  'pt-br': { stats: 'Estatísticas', abilities: 'Habilidades', profile: 'Perfil', height: 'Altura', weight: 'Peso', sprites: 'Sprites', hidden: 'Oculta' },
};

const statTranslations: { [key: string]: string } = {
    'hp': 'HP', 'attack': 'Ataque', 'defense': 'Defesa', 'special-attack': 'Ataque Especial', 'special-defense': 'Defesa Especial', 'speed': 'Velocidade'
};
const abilityTranslations: { [key: string]: string } = {
    'stench': 'Fedor', 'drizzle': 'Chuvisco', 'speed-boost': 'Aumento de Velocidade', 'battle-armor': 'Armadura de Batalha', 'sturdy': 'Robustez', 'damp': 'Úmido', 'limber': 'Flexibilidade', 'sand-veil': 'Véu de Areia', 'static': 'Estático', 'volt-absorb': 'Absorver Voltagem', 'water-absorb': 'Absorver Água', 'oblivious': 'Indiferente', 'cloud-nine': 'Nuvem Nove', 'compound-eyes': 'Olhos Compostos', 'insomnia': 'Insônia', 'color-change': 'Mudança de Cor', 'immunity': 'Imunidade', 'flash-fire': 'Inflamar', 'shield-dust': 'Pó de Escudo', 'own-tempo': 'Ritmo Próprio', 'suction-cups': 'Ventosas', 'intimidate': 'Intimidar', 'shadow-tag': 'Marca Sombria', 'rough-skin': 'Pele Áspera', 'wonder-guard': 'Superguarda', 'levitate': 'Levitar', 'effect-spore': 'Efeito de Esporo', 'synchronize': 'Sincronizar', 'clear-body': 'Corpo Puro', 'natural-cure': 'Cura Natural', 'lightning-rod': 'Pára-Raios', 'serene-grace': 'Graça Serene', 'swift-swim': 'Nado Rápido', 'chlorophyll': 'Clorofila', 'illuminate': 'Iluminar', 'trace': 'Rastrear', 'huge-power': 'Poder Imenso', 'poison-point': 'Ponto de Veneno', 'inner-focus': 'Foco Interno', 'magma-armor': 'Armadura de Magma', 'water-veil': 'Véu de Água', 'magnet-pull': 'Puxão Magnético', 'soundproof': 'À Prova de Som', 'rain-dish': 'Prato de Chuva', 'sand-stream': 'Fluxo de Areia', 'pressure': 'Pressão', 'thick-fat': 'Gordura Espessa', 'early-bird': 'Pássaro Madrugador', 'flame-body': 'Corpo em Chamas', 'run-away': 'Fugir', 'keen-eye': 'Olho Aguçado', 'hyper-cutter': 'Hiper Cortador', 'pickup': 'Coletar', 'truant': 'Ausente', 'hustle': 'Agitação', 'cute-charm': 'Charme Fofo', 'plus': 'Mais', 'minus': 'Menos', 'forecast': 'Previsão', 'sticky-hold': 'Aperto Pegajoso', 'shed-skin': 'Troca de Pele', 'guts': 'Entranhas', 'marvel-scale': 'Escama Maravilhosa', 'liquid-ooze': 'Lodo Líquido', 'overgrow': 'Supercrescimento', 'blaze': 'Chama', 'torrent': 'Torrente', 'swarm': 'Enxame', 'rock-head': 'Cabeça de Rocha', 'drought': 'Seca', 'arena-trap': 'Armadilha de Arena', 'vital-spirit': 'Espírito Vital', 'white-smoke': 'Fumaça Branca', 'pure-power': 'Poder Puro', 'shell-armor': 'Armadura de Concha', 'air-lock': 'Bloqueio de Ar', 'tangled-feet': 'Pés Emaranhados', 'motor-drive': 'Direção Motorizada', 'rivalry': 'Rivalidade', 'steadfast': 'Inabalável', 'snow-cloak': 'Manto de Neve', 'gluttony': 'Gula', 'anger-point': 'Ponto de Raiva', 'unburden': 'Desimpedir', 'heatproof': 'À Prova de Calor', 'simple': 'Simples', 'dry-skin': 'Pele Seca', 'download': 'Download', 'iron-fist': 'Punho de Ferro', 'poison-heal': 'Cura por Veneno', 'adaptability': 'Adaptabilidade', 'skill-link': 'Elo de Habilidade', 'hydration': 'Hidratação', 'solar-power': 'Poder Solar', 'quick-feet': 'Pés Rápidos', 'normalize': 'Normalizar', 'sniper': 'Franco-Atirador', 'magic-guard': 'Guarda Mágica', 'no-guard': 'Sem Guarda', 'stall': 'Parar', 'technician': 'Técnico', 'leaf-guard': 'Guarda de Folha', 'klutz': 'Desajeitado', 'mold-breaker': 'Quebra-Forma', 'super-luck': 'Super Sorte', 'aftermath': 'Resultado', 'anticipation': 'Antecipação', 'forewarn': 'Avisar', 'unaware': 'Inconsciente', 'tinted-lens': 'Lente Tingida', 'filter': 'Filtro', 'slow-start': 'Início Lento', 'scrappy': 'Intrépido', 'storm-drain': 'Dreno de Tempestade', 'ice-body': 'Corpo de Gelo', 'solid-rock': 'Rocha Sólida', 'snow-warning': 'Aviso de Neve', 'honey-gather': 'Coletor de Mel', 'frisk': 'Revistar', 'reckless': 'Imprudente', 'multitype': 'Multitipo', 'flower-gift': 'Dádiva Floral', 'bad-dreams': 'Pesadelos'
};
export default function PokemonDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const [pokemonDetails, setPokemonDetails] = useState<PokemonDetails | null>(null);
  const [pokemonSpecies, setPokemonSpecies] = useState<PokemonSpecies | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [language, setLanguage] = useState<'en' | 'pt-br'>('en');
  useEffect(() => {
    if (!name) return;
    const fetchAllDetails = async () => {
      setIsLoading(true);
      try {
        const detailResponse = await fetch(`${API_URL}/${name}`);
        const detailData: PokemonDetails = await detailResponse.json();
        setPokemonDetails(detailData);

        if (detailData.species.url) {
            const speciesResponse = await fetch(detailData.species.url);
            const speciesData: PokemonSpecies = await speciesResponse.json();
            setPokemonSpecies(speciesData);
        }
      } catch (error) {
        console.error("Failed to fetch Pokémon details:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllDetails();
  }, [name]);
  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'pt-br' : 'en');
  };
  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#CC0000" /></View>;
  }
  if(!pokemonDetails) {
    return <View style={styles.loadingContainer}><Text style={styles.errorText}>Could not load Pokémon details.</Text></View>;
  }
  const mainType = pokemonDetails.types[0].type.name;
  const backgroundColor = typeColors[mainType] || '#CCC'; 
  const getTranslatedName = () => {
    if (language === 'pt-br' && pokemonSpecies) {
        const ptName = pokemonSpecies.names.find(n => n.language.name === 'pt');
        if (ptName) return ptName.name;
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const currentTranslations = translations[language];
  const displayName = getTranslatedName();
  return (
    <>
      <Stack.Screen options={{ 
        title: displayName,
        headerStyle: { backgroundColor: backgroundColor },
        headerTintColor: '#fff',
        headerRight: () => (
            <TouchableOpacity onPress={toggleLanguage} style={styles.langButton}>
                <Text style={styles.langButtonText}>{language === 'en' ? 'PT' : 'EN'}</Text>
            </TouchableOpacity>
        )
      }} />
      <ScrollView style={[styles.detailContainer, { backgroundColor }]}>
        <View style={styles.detailHeader}>
          <Image source={{ uri: pokemonDetails.sprites.front_default }} style={styles.detailSprite} />
          <Text style={styles.detailName}>{`#${pokemonDetails.id} ${displayName}`}</Text>
          <View style={styles.typesContainer}>
            {pokemonDetails.types.map((typeInfo) => (
              <View key={typeInfo.slot} style={[styles.typeBadge, { backgroundColor: typeColors[typeInfo.type.name] || '#CCC' }]}>
                <Text style={styles.typeText}>{typeInfo.type.name.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>{currentTranslations.stats}</Text>
          {pokemonDetails.stats.map((statInfo, index) => (
            <View key={index} style={styles.statRow}>
              <Text style={styles.statName}>{language === 'pt-br' ? statTranslations[statInfo.stat.name] : statInfo.stat.name.replace('-', ' ').toUpperCase()}</Text>
              <Text style={styles.statValue}>{statInfo.base_stat}</Text>
              <View style={styles.statBarBackground}>
                <View style={[styles.statBar, { width: `${Math.min(statInfo.base_stat / 150 * 100, 100)}%`, backgroundColor: statInfo.base_stat > 75 ? '#4CAF50' : '#F44336' }]} />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.detailSection}>
           <Text style={styles.sectionTitle}>{currentTranslations.abilities}</Text>
           {pokemonDetails.abilities.map((abilityInfo, index) => (
              <Text key={index} style={styles.abilityText}>
                {language === 'pt-br' ? abilityTranslations[abilityInfo.ability.name] || abilityInfo.ability.name : abilityInfo.ability.name.replace('-', ' ')}
                {abilityInfo.is_hidden && ` (${currentTranslations.hidden})`}
              </Text>
           ))}
        </View>
         
        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>{currentTranslations.profile}</Text>
          <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>{currentTranslations.height}:</Text>
              <Text style={styles.profileValue}>{pokemonDetails.height / 10} m</Text>
          </View>
          <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>{currentTranslations.weight}:</Text>
              <Text style={styles.profileValue}>{pokemonDetails.weight / 10} kg</Text>
          </View>
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>{currentTranslations.sprites}</Text>
          <View style={styles.spritesContainer}>
              <Image source={{ uri: pokemonDetails.sprites.front_default }} style={styles.spriteSmall} />
              <Image source={{ uri: pokemonDetails.sprites.back_default }} style={styles.spriteSmall} />
              <Image source={{ uri: pokemonDetails.sprites.front_shiny }} style={styles.spriteSmall} />
              <Image source={{ uri: pokemonDetails.sprites.back_shiny }} style={styles.spriteSmall} />
          </View>
        </View>
      </ScrollView>
    </>
  );
}
const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  errorText: { fontSize: 18, color: '#333' },
  detailContainer: { flex: 1 },
  detailHeader: { alignItems: 'center', padding: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' },
  detailSprite: { width: 200, height: 200, marginBottom: 10 },
  detailName: { fontSize: 32, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0, 0, 0, 0.4)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10, textTransform: 'capitalize' },
  typesContainer: { flexDirection: 'row', marginTop: 10 },
  typeBadge: { paddingHorizontal: 15, paddingVertical: 5, borderRadius: 15, marginHorizontal: 5, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
  typeText: { color: '#fff', fontWeight: 'bold', fontSize: 14, textTransform: 'uppercase' },
  detailSection: { backgroundColor: '#fff', borderRadius: 15, padding: 20, margin: 16, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: '#333', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statName: { width: '45%', fontSize: 14, color: '#666', textTransform: 'capitalize' },
  statValue: { width: '15%', fontSize: 14, fontWeight: 'bold', color: '#333' },
  statBarBackground: { flex: 1, height: 10, backgroundColor: '#e0e0e0', borderRadius: 5, overflow: 'hidden' },
  statBar: { height: '100%', borderRadius: 5 },
  abilityText: { fontSize: 16, color: '#444', textTransform: 'capitalize', marginBottom: 5 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  profileLabel: { fontSize: 16, color: '#666', fontWeight: 'bold' },
  profileValue: { fontSize: 16, color: '#333' },
  spritesContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  spriteSmall: { width: 80, height: 80 },
  langButton: { marginRight: 15, padding: 5 },
  langButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});