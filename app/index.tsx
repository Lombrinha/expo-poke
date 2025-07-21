import React, { useRef, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  SafeAreaView, 
  StatusBar, 
  Platform,
  FlatList,
  ImageBackground,
  Animated,
  Dimensions,
  ListRenderItem,
  ViewToken
} from 'react-native';
import { Link, LinkProps } from 'expo-router';
const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7;
const CARD_MARGIN = (width - CARD_WIDTH) / 2;
interface MenuItem {
  id: string;
  title: string;
  href: LinkProps['href'];
  image: { uri: string };
}
const menuItems: MenuItem[] = [
  {
    id: '1',
    title: 'Quem é esse Pokémon?',
    href: '/game',
    image: { uri: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExYm9pMmF0Nm5tbjQzZzl4dDZodGZpdm4xamJvc29tYXhxcnQxZHpwbCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/DRfu7BT8ZK1uo/giphy.gif' },
  },
  {
    id: '2',
    title: 'Pokédex',
    href: '/pokedex',
    image: { uri: 'https://i.gifer.com/CvaH.gif' },
  },
  {
    id: '3',
    title: 'Jogo da Memória',
    href: '/memory',
    image: { uri: 'https://wiki.pokexgames.com/images/5/56/Exemplomemory.gif' },
  },
  {
    id: '4',
    title: 'Corrida de Pokémon',
    href: '/race',
    image: { uri: 'https://i.kym-cdn.com/photos/images/original/001/140/718/13d.gif' },
  },
  {
    id: '5',
    title: 'Rinha de Pokémon',
    href: '/battle',
    image: { uri: 'https://i.kym-cdn.com/photos/images/original/002/302/363/b9a.gif' },
  },
];
const MenuCard = ({ item }: { item: MenuItem }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };
  return (
    <Link href={item.href} asChild>
      <TouchableOpacity
        activeOpacity={0.9}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={[styles.card, { transform: [{ scale: scaleValue }] }]}>
          <ImageBackground 
            source={item.image} 
            style={styles.cardImage}
            imageStyle={{ borderRadius: 20 }}
            resizeMode="stretch"
          >
            <View style={styles.cardOverlay}>
              <Text style={styles.cardTitle}>{item.title}</Text>
            </View>
          </ImageBackground>
        </Animated.View>
      </TouchableOpacity>
    </Link>
  );
};
export default function MainMenu() {
  const renderCard: ListRenderItem<MenuItem> = ({ item }) => <MenuCard item={item} />;  
  const flatListRef = useRef<FlatList<MenuItem>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollNext = () => {
    if (currentIndex < menuItems.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    }
  };
  const scrollPrev = () => {
    if (currentIndex > 0) {
      flatListRef.current?.scrollToIndex({ index: currentIndex - 1, animated: true });
    }
  };
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 51 }).current;
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>PokéApp</Text>
        <Text style={styles.subtitle}>Escolha a sua aventura!</Text>
      </View>
      <View style={styles.carouselContainer}>
        {Platform.OS === 'web' && currentIndex > 0 && (
          <TouchableOpacity onPress={scrollPrev} style={[styles.arrow, styles.arrowLeft]}>
            <Text style={styles.arrowText}>‹</Text>
          </TouchableOpacity>
        )}
        <FlatList
          ref={flatListRef}
          data={menuItems}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="center"
          decelerationRate="fast"
          snapToInterval={Platform.OS === 'web' ? 400 : CARD_WIDTH + 20}
          contentContainerStyle={styles.flatListContent}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          style={styles.flatList}
        />
        {Platform.OS === 'web' && currentIndex < menuItems.length - 1 && (
          <TouchableOpacity onPress={scrollNext} style={[styles.arrow, styles.arrowRight]}>
            <Text style={styles.arrowText}>›</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3B4CCA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFCB05',
    ...Platform.select({
      web: { textShadow: '3px 3px 4px #000000' },
      default: { textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 },
    }),
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginTop: 10,
    fontWeight: '500',
  },
  carouselContainer: {
    height: 500, 
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatList: {
    flexGrow: 0,
  },
  flatListContent: {
    paddingHorizontal: Platform.OS === 'web' ? 0 : CARD_MARGIN,
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    maxWidth: 380, 
    height: '90%',
    borderRadius: 20,
    marginHorizontal: 10,
    backgroundColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  cardOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 15,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-25px)',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 50,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  arrowLeft: {
    left: 20,
  },
  arrowRight: {
    right: 20,
  },
  arrowText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3B4CCA',
  },
});
