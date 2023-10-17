#include <fmt/format.h>

namespace JS {
template<typename T>
class Array {
  T* _data;
  size_t _length;

public:
  Array(const std::initializer_list<T> data, size_t length) {
    _data = const_cast<T*>(data.begin());
    _length = length;
  }

  Array(const Array& source) {
    _data = source._data;
    _length = source._length;
  }

  Array(Array&& source) {
    _data = source._data;
    _length = source._length;
  }

  const T* data() const {
    return _data;
  }

  size_t length() const {
    return _length;
  }
};
}

template<typename T>
struct fmt::formatter<JS::Array<T>>
{
  template<typename ParseContext>
  constexpr auto parse(ParseContext& ctx) {
    return ctx.begin();
  }

  template<typename FormatContext>
  auto format(JS::Array<T> const& array, FormatContext& ctx) {
    fmt::format_to(ctx.out(), "[");
    
    for (size_t i = 0; i < array.length(); i++) {
      fmt::format_to(ctx.out(), " {0}", array.data()[i]);

      if (i != array.length() - 1) {
        fmt::format_to(ctx.out(), ",");
      } else {
        fmt::format_to(ctx.out(), " ");
      }
    }

    return fmt::format_to(ctx.out(), "]");
  }
};
